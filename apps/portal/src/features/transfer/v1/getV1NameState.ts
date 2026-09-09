import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetExpiryErrorType,
  type GetExpiryReturnType,
  type GetOwnerErrorType,
  type GetOwnerReturnType,
  type GetWrapperDataErrorType,
  type GetWrapperDataReturnType,
  getExpiry,
  getOwner,
  getWrapperData,
} from '@ensdomains/ensjs/public/v1'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import { fromPromise, ok } from 'neverthrow'
import { match, P } from 'ts-pattern'
import {
  type Address,
  isAddressEqual,
  namehash,
  type ReadContractErrorType,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  getEth2LDAncestor,
  getParentName,
  is2LD,
  isRegistrable,
} from '@/utils/ens/tldHelpers'
import type { V1ParentState, V1TransferSubject } from '../types'

export class NameNotNormalizableError extends TaggedError(
  'NameNotNormalizableError',
)<{
  cause: unknown
}> {}

export class GetV1NameStateError extends TaggedError('GetV1NameStateError')<{
  cause:
    | GetOwnerErrorType
    | GetExpiryErrorType
    | GetWrapperDataErrorType
    | ReadContractErrorType
}> {}

export type V1RegistrationStatus = 'active' | 'gracePeriod' | 'expired'

/**
 * `resolveEnsOwner` (what the rest of the app uses) flattens V1 ownership to a
 * single `owner`, which for an unwrapped `.eth` 2LD is the *controller* — not
 * the registrant who can actually move the token. This keeps the two apart, and
 * carries the parent's shape alongside so the parent-initiated path
 * (`setSubnodeOwner`) can be gated off the same read.
 */
export type V1NameState = {
  /**
   * What would move, or null when the name has lapsed: the registrar no longer
   * reports a registrant, or an emancipated wrapped name reads a zero owner.
   */
  readonly subject: V1TransferSubject | null
  /**
   * Registrar status for a `.eth` 2LD; null for other names. Read for every
   * 2LD regardless of how it is held: a wrapped 2LD in grace surfaces from
   * `getOwner` as a registrar-level name with no registrant (the 721 `ownerOf`
   * reverts once expired), so the wrapper data alone cannot tell grace from
   * gone.
   */
  readonly registration: V1RegistrationStatus | null
  /** The resolver on the name's own registry slot, or null if none. */
  readonly resolverAddress: Address | null
  /** How the parent node is held. Null for a 2LD, whose parent is a TLD. */
  readonly parent: V1ParentState | null
  /**
   * Registrar status of the `.eth` 2LD a deeper name sits under. Its lapse
   * takes the whole subtree with it: whoever registers it next can re-issue
   * every name below. Null for a 2LD itself or a non-`.eth` name.
   */
  readonly ancestorRegistration: V1RegistrationStatus | null
}

export type V1NameReads = {
  readonly nameWrapper: Address
  readonly owner: GetOwnerReturnType
  /** Null when the name is not wrapped — or wrapped with a zero owner. */
  readonly wrapped: GetWrapperDataReturnType
  readonly resolver: Address
  /** Registrar expiry; only read for a `.eth` 2LD. */
  readonly expiry: GetExpiryReturnType | null
  /** The parent's reads; only taken for a subname. */
  readonly parentOwner: GetOwnerReturnType | null
  readonly parentWrapped: GetWrapperDataReturnType | null
  /** Registrar expiry of the `.eth` 2LD ancestor; only read below a 2LD. */
  readonly ancestorExpiry: GetExpiryReturnType | null
}

const nonZero = (address: Address | null | undefined): Address | null =>
  address && !isAddressEqual(address, zeroAddress) ? address : null

const deriveSubject = (
  owner: NonNullable<GetOwnerReturnType>,
  wrapped: GetWrapperDataReturnType,
  nameWrapper: Address,
): V1TransferSubject | null =>
  match(owner)
    .with(
      { ownershipLevel: 'nameWrapper' },
      (): V1TransferSubject | null =>
        // `getWrapperData` reads a zero owner as "not wrapped" — but we already
        // know it is wrapped, so a zero owner here is an expired emancipated name
        // that the wrapper has cleared.
        wrapped && {
          kind: 'v1-wrapped',
          owner: wrapped.owner,
          fuses: {
            cannotTransfer: wrapped.fuses.child.CANNOT_TRANSFER,
            cannotSetResolver: wrapped.fuses.child.CANNOT_SET_RESOLVER,
            cannotUnwrap: wrapped.fuses.child.CANNOT_UNWRAP,
            parentCannotControl: wrapped.fuses.parent.PARENT_CANNOT_CONTROL,
          },
          // ensjs returns milliseconds; the rest of the app works in seconds.
          expiry: wrapped.expiry === null ? null : wrapped.expiry / 1000n,
        },
    )
    // No registrant means the 721 `ownerOf` reverted: the registration has
    // lapsed (grace or beyond). `registration` says which.
    .with({ ownershipLevel: 'registrar', registrant: P.nullish }, () => null)
    .with(
      { ownershipLevel: 'registrar', registrant: P.string },
      ({ registrant, owner: controller }): V1TransferSubject => ({
        kind: 'v1-registrar',
        registrant,
        controller: nonZero(controller),
      }),
    )
    // Registry level. A registry owner that is the NameWrapper with no wrapper
    // owner behind it is an expired wrapped subname — `getOwner` falls through
    // to the raw registry read in that case.
    .with(
      { ownershipLevel: 'registry' },
      ({ owner }): V1TransferSubject | null =>
        isAddressEqual(owner, nameWrapper)
          ? null
          : { kind: 'v1-registry', owner },
    )
    .exhaustive()

/**
 * Who holds the parent node and how. Mirrors `deriveSubject`'s reading of the
 * wrapper: a registry owner that is the NameWrapper with nobody behind it is a
 * wrapped parent whose emancipated expiry has lapsed.
 */
const deriveParent = (
  owner: GetOwnerReturnType,
  wrapped: GetWrapperDataReturnType,
  nameWrapper: Address,
): V1ParentState | null => {
  if (!owner) return null
  const asWrapped = (): V1ParentState => ({
    owner: wrapped?.owner ?? null,
    registrant: null,
    isWrapped: true,
    cannotCreateSubdomain:
      wrapped?.fuses.child.CANNOT_CREATE_SUBDOMAIN ?? false,
  })
  return match(owner)
    .with({ ownershipLevel: 'nameWrapper' }, asWrapped)
    .with(
      { ownershipLevel: 'registry' },
      ({ owner }) => isAddressEqual(owner, nameWrapper),
      asWrapped,
    )
    .with({ ownershipLevel: 'registrar' }, ({ owner, registrant }) => ({
      owner: nonZero(owner),
      registrant: nonZero(registrant),
      isWrapped: false,
      cannotCreateSubdomain: false,
    }))
    .with({ ownershipLevel: 'registry' }, ({ owner }) => ({
      owner: nonZero(owner),
      registrant: null,
      isWrapped: false,
      cannotCreateSubdomain: false,
    }))
    .exhaustive()
}

/**
 * Pure: the shapes the contracts produce — an expired emancipated subname, a
 * grace-period parent, a registrar-level name with no registrant — are pinned
 * in `getV1NameState.test.ts`. Null when the name has no owner at any level.
 */
export const deriveV1NameState = ({
  nameWrapper,
  owner,
  wrapped,
  resolver,
  expiry,
  parentOwner,
  parentWrapped,
  ancestorExpiry,
}: V1NameReads): V1NameState | null => {
  if (!owner) return null
  return {
    subject: deriveSubject(owner, wrapped, nameWrapper),
    registration: expiry?.status ?? null,
    resolverAddress: nonZero(resolver),
    parent: deriveParent(parentOwner, parentWrapped, nameWrapper),
    ancestorRegistration: ancestorExpiry?.status ?? null,
  }
}

type GetV1NameStateParameters = {
  readonly name: string
}

/**
 * Everything the transfer flow needs to know about a V1 name, read once and
 * handed to `deriveV1NameState`. All reads are independent and fired together
 * so the client's batching coalesces them into one request.
 */
const getV1NameState = ResultFn(async function* ({
  name: rawName,
}: GetV1NameStateParameters) {
  // Route-supplied, so normalise once here: every hash and ensjs read below
  // must see the same canonical form or equivalent spellings diverge on-chain.
  const name = yield* fromSync(
    () => normalize(rawName),
    (e) => new NameNotNormalizableError({ cause: e }),
  )

  const client = yield* safeGetClient()

  const nameWrapper = getChainContractAddress({
    chain: client.chain,
    contract: 'ensNameWrapper',
  })
  // A 2LD's parent is a TLD: `.eth` is the registrar's, a DNS TLD is the
  // DNSRegistrar's. Neither is a counterparty worth reading.
  const parentName = is2LD(name) ? null : getParentName(name)
  const ancestorName = getEth2LDAncestor(name)

  const fail = (e: unknown) =>
    new GetV1NameStateError({ cause: e as GetV1NameStateError['cause'] })

  const [
    owner,
    wrapped,
    resolver,
    expiry,
    parentOwner,
    parentWrapped,
    ancestorExpiry,
  ] = yield* fromPromise(
    Promise.all([
      getOwner(client, { name }),
      // Only meaningful when the name turns out to be wrapped, but reading it
      // in the same batch saves a round trip; for an unwrapped name it is null.
      getWrapperData(client, { name }),
      getAction(
        client,
        readContract,
        'readContract',
      )({
        address: getChainContractAddress({
          chain: client.chain,
          contract: 'ensLegacyRegistry',
        }),
        abi: registryResolverSnippet,
        functionName: 'resolver',
        args: [namehash(name)],
      }),
      isRegistrable(name) ? getExpiry(client, { name }) : null,
      parentName ? getOwner(client, { name: parentName }) : null,
      parentName ? getWrapperData(client, { name: parentName }) : null,
      ancestorName ? getExpiry(client, { name: ancestorName }) : null,
    ]),
    fail,
  )

  return ok<V1NameState | null>(
    deriveV1NameState({
      nameWrapper,
      owner,
      wrapped,
      resolver,
      expiry,
      parentOwner,
      parentWrapped,
      ancestorExpiry,
    }),
  )
})

const getV1NameStateQueryKey = createQueryKey<
  'transfer-v1-name-state',
  GetV1NameStateParameters
>('transfer-v1-name-state')

export const getV1NameStateQueryOptions = (params: GetV1NameStateParameters) =>
  resultQueryOptions({
    queryKey: getV1NameStateQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1NameState(params),
  })
