/**
 * The on-chain id of the name a route is showing, asked of the registry that
 * holds it.
 *
 * Almost every name yields its id from the name itself, with no read at all:
 * the registry hashed the first label, and {@link resourceIdForName} hashes the
 * same characters. The exception is a first label written as `[<64 hex>]`,
 * which has two readings and the string does not say which:
 *
 * - **the literal label** — 66 characters that were registered as they stand,
 *   whose id is `keccak` of those characters;
 * - **an undecoded label** — how ENS renders a label whose preimage nothing has
 *   seen, where the digits already *are* the labelhash.
 *
 * Both are valid ids, and they are different names. The registry can tell them
 * apart, because it holds an entry for whichever one exists: `getState(anyId)`
 * is asked about both candidates in one multicall, and exactly one answer that
 * the registry knows settles it. Anything else refuses.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { err, fromPromise } from 'neverthrow'
import {
  type Address,
  keccak256,
  type MulticallErrorType,
  toBytes,
  zeroAddress,
} from 'viem'
import { multicall } from 'viem/actions'
import { getAction } from 'viem/utils'
import {
  ResourceIdError,
  ROOT_RESOURCE_ID,
  resourceIdForName,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNameResourceIdError extends TaggedError('GetNameResourceIdError')<{
  cause: MulticallErrorType | ResourceIdError
}> {}

type GetNameResourceIdParameters = {
  readonly name: string
  /**
   * The registry holding the name's entry — its parent's registry.
   * `undefined` while discovery is still running: the read is not startable
   * then, and the key says so rather than carrying a placeholder address.
   */
  readonly registryAddress: Address | undefined
}

/** The `[<64 hex>]` form, with the digits captured. */
const ENCODED_LABEL = /^\[([0-9a-fA-F]{64})\]$/

/** What the registry answers about one id. */
type RegistryState = {
  readonly status: number
  readonly expiry: bigint
  readonly latestOwner: Address
  readonly tokenId: bigint
  readonly resource: bigint
}

/**
 * Whether the registry has an entry for this id.
 *
 * Deliberately not `status === REGISTERED`. `_constructStatus` returns
 * `AVAILABLE` for anything `_isExpired` is true of, and `_isExpired` is
 * `block.timestamp >= expiry` — so a name that has merely expired reads exactly
 * like one that never existed, and those are the names an owner is most likely
 * to be trying to manage.
 *
 * `expiry != 0` is the registry's own test: `renew` treats `expiry == 0` as
 * "never registered", and `_register` refuses a zero expiry, so every entry the
 * registry has ever written carries a non-zero one. `latestOwner` is checked
 * too, as a second reading of the same question.
 */
const isKnownToRegistry = (state: RegistryState): boolean =>
  state.expiry !== 0n || state.latestOwner !== zeroAddress

/**
 * The two ids a `[<64 hex>]` label could mean, or `null` when the first label
 * is not in that form.
 *
 * `ROOT_RESOURCE` is never a candidate: a label of 64 zeros reads as the root
 * resource, and root is a scope, not a name.
 */
export const encodedLabelCandidates = (
  name: string,
): readonly [literal: bigint, decoded: bigint] | null => {
  const label = name.split('.')[0] ?? ''
  const digits = ENCODED_LABEL.exec(label)?.[1]
  if (digits === undefined) return null

  // `keccak256` of the characters, not `labelhash`: `labelhash` reads this
  // exact string as an already-hashed label and hands back the digits, which
  // is the other candidate.
  const literal = BigInt(keccak256(toBytes(label)))
  const decoded = BigInt(`0x${digits}`)

  if (literal === decoded) return null
  if (literal === ROOT_RESOURCE_ID || decoded === ROOT_RESOURCE_ID) return null

  return [literal, decoded] as const
}

/**
 * Which of the two readings the registry holds an entry for.
 *
 * Refuses when both are known (nothing distinguishes them) and when neither is
 * (there is no name here to address), rather than picking one.
 */
export const getNameResourceId = ResultFn(async function* ({
  name,
  registryAddress,
}: GetNameResourceIdParameters) {
  if (registryAddress === undefined)
    return err(
      new GetNameResourceIdError({
        cause: new ResourceIdError({
          reason: 'encoded-label',
          message: `The registry holding "${name}" is not known yet, so its id could not be read.`,
        }),
      }),
    )

  const candidates = encodedLabelCandidates(name)

  if (candidates === null)
    return err(
      new GetNameResourceIdError({
        cause: new ResourceIdError({
          reason: 'encoded-label',
          message: `The id of "${name}" cannot be resolved from the registry: its first label is not an encoded labelhash, or the two readings collapse to the same id.`,
        }),
      }),
    )

  const client = yield* safeGetClient()
  const multicallAction = getAction(client, multicall, 'multicall')

  const results = yield* fromPromise(
    multicallAction({
      contracts: candidates.map((anyId) => ({
        address: registryAddress,
        abi: permissionedRegistryGetStateSnippet,
        functionName: 'getState',
        args: [anyId],
      })),
      allowFailure: true,
    }),
    (e) => new GetNameResourceIdError({ cause: e as MulticallErrorType }),
  )

  // A read that reverted is not an answer, so it never counts as "unknown" —
  // it just fails to be the one known entry, and the refusal below holds.
  const known = results.flatMap((result) => {
    if (result.status !== 'success') return []
    const state = result.result as unknown as RegistryState
    return isKnownToRegistry(state) ? [state] : []
  })

  if (known.length !== 1)
    return err(
      new GetNameResourceIdError({
        cause: new ResourceIdError({
          reason: 'encoded-label',
          message:
            known.length === 0
              ? `The registry holds no name written as "${name}", so its id could not be established.`
              : `Both readings of "${name}" name a registered entry, so which one this is cannot be told apart.`,
        }),
      }),
    )

  // The registry's own resource for the entry it matched, so nothing has to be
  // re-derived from the id we happened to ask with.
  return resourceIdFromChainValue(known[0]?.resource).mapErr(
    (cause) => new GetNameResourceIdError({ cause }),
  )
})

const getNameResourceIdQueryKey = createQueryKey<
  'get-name-resource-id',
  GetNameResourceIdParameters
>('get-name-resource-id')

export const getNameResourceIdQueryOptions = (
  params: GetNameResourceIdParameters,
) =>
  resultQueryOptions({
    queryKey: getNameResourceIdQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameResourceId(params),
  })

/**
 * Whether a name's id has to be read from the registry at all.
 *
 * Pure, and the thing a call site puts in `enabled`: an ordinary first label is
 * hashed locally by {@link resourceIdForName}, so only the ambiguous
 * `[<64 hex>]` form costs a read.
 */
export const needsRegistryLookupForId = (name: string): boolean =>
  resourceIdForName(name).isErr()
