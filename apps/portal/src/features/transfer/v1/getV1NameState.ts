import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetExpiryErrorType,
  type GetOwnerErrorType,
  type GetWrapperDataErrorType,
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
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getParentName, is2LD, isRegistrable } from '@/utils/ens/tldHelpers'
import type { V1TransferSubject } from '../types'

export class GetV1NameStateError extends TaggedError('GetV1NameStateError')<{
  cause:
    | GetOwnerErrorType
    | GetExpiryErrorType
    | GetWrapperDataErrorType
    | ReadContractErrorType
}> {}

/**
 * Everything the transfer flow needs to know about a V1 name, read once.
 *
 * `resolveEnsOwner` (what the rest of the app uses) flattens V1 ownership to a
 * single `owner`, which for an unwrapped `.eth` 2LD is the *controller* — not
 * the registrant who can actually move the token. This reads the full ensjs v1
 * `getOwner` shape and keeps the two slots apart.
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
  readonly registration: 'active' | 'gracePeriod' | 'expired' | null
  /** The resolver on the name's own registry slot, or null if none. */
  readonly resolverAddress: Address | null
  /**
   * Who can `setSubnodeOwner` the name from above: the parent's wrapper owner
   * or registry owner. Null for a 2LD, whose parent is a TLD.
   */
  readonly parentOwner: Address | null
}

type GetV1NameStateParameters = {
  readonly name: string
}

const getV1NameState = ResultFn(async function* ({
  name,
}: GetV1NameStateParameters) {
  const client = yield* safeGetClient()

  const nameWrapper = getChainContractAddress({
    chain: client.chain,
    contract: 'ensNameWrapper',
  })
  const parentName = getParentName(name)

  const fail = (e: unknown) =>
    new GetV1NameStateError({ cause: e as GetV1NameStateError['cause'] })

  const [owner, resolver, expiry, parentOwner] = yield* fromPromise(
    Promise.all([
      getOwner(client, { name }),
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
      // A 2LD's parent is a TLD: `.eth` is the registrar's, a DNS TLD is the
      // DNSRegistrar's. Neither is a counterparty worth reading.
      parentName !== null && !is2LD(name)
        ? getOwner(client, { name: parentName })
        : null,
    ]),
    fail,
  )

  if (!owner) return ok<V1NameState | null>(null)

  const wrapped =
    owner.ownershipLevel === 'nameWrapper'
      ? yield* fromPromise(getWrapperData(client, { name }), fail)
      : null

  const subject = match(owner)
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
        controller:
          controller && !isAddressEqual(controller, zeroAddress)
            ? controller
            : null,
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

  return ok<V1NameState | null>({
    subject,
    registration: expiry?.status ?? null,
    resolverAddress: isAddressEqual(resolver, zeroAddress) ? null : resolver,
    parentOwner: parentOwner?.owner ?? null,
  })
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
