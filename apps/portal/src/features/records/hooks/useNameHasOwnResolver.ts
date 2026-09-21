/**
 * Whether a name has a resolver of its own, rather than inheriting one.
 *
 * `getResolver` answers "which resolver resolves this name", and under ENSIP-10
 * that can be a wildcard resolver set on an ancestor. A DNS name with no
 * resolver of its own still resolves: the TLD's OffchainDNSResolver reads the
 * name's `ENS1` TXT record and delegates to a read-only ExtendedDNSResolver.
 * Reads succeed, so the name looks fully configured — but no resolver on chain
 * will accept a record write. A setter encoded against the inherited resolver
 * reverts while estimating, the wallet falls back to a block-gas-limit guess,
 * and the RPC rejects that as "gas limit too high", naming nothing the user can
 * act on.
 *
 * Detaching a resolver is an ordinary thing to do — the Send flow offers it as
 * a default-on option, and a DNS re-import with plain `proveAndClaim` sets an
 * owner without restoring one — so this state has to be recognised rather than
 * assumed away.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { parseAbi, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { dnsEncodeName } from '@/utils/token/dnsEncodeName'

/**
 * `findResolver` walks the registry leaf-first and returns the resolver it
 * stopped at, that label's node, and the offset into the DNS-encoded name where
 * it stopped. Offset 0 is the queried name itself.
 */
const findResolverAbi = parseAbi([
  'function findResolver(bytes name) view returns (address resolver, bytes32 node, uint256 offset)',
])

class GetNameHasOwnResolverError extends TaggedError(
  'GetNameHasOwnResolverError',
)<{
  cause: unknown
}> {}

export type GetNameHasOwnResolverParams = {
  name: string
}

export const getNameHasOwnResolver = ResultFn(async function* ({
  name,
}: GetNameHasOwnResolverParams) {
  const client = yield* safeGetClient()

  const [resolver, , offset] = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: universalResolverAddress,
      abi: findResolverAbi,
      functionName: 'findResolver',
      args: [dnsEncodeName(name)],
    }),
    (e) => new GetNameHasOwnResolverError({ cause: e }),
  )

  // Going through the UniversalResolver rather than reading a registry directly
  // keeps this agnostic to which registry version holds the name, and needs no
  // list of known resolver deployments — a custom or per-name resolver answers
  // here exactly as the public one does.
  //
  // The null check carries its weight: a name with no resolver anywhere also
  // reports offset 0, because the walk runs off the root without ever finding
  // one.
  return ok(resolver !== zeroAddress && offset === 0n)
})

const nameHasOwnResolverQueryKey = createQueryKey<
  'name-has-own-resolver',
  GetNameHasOwnResolverParams
>('name-has-own-resolver')

export const getNameHasOwnResolverQueryOptions = (
  params: GetNameHasOwnResolverParams,
) =>
  resultQueryOptions({
    queryKey: nameHasOwnResolverQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameHasOwnResolver(params),
  })

export type UseNameHasOwnResolverParams = {
  name: string | undefined
}

/**
 * @returns `true` when the name's own registry entry names a resolver, `false`
 * when the resolver answering for it is inherited or absent.
 */
export function useNameHasOwnResolver({ name }: UseNameHasOwnResolverParams) {
  return useQuery({
    ...getNameHasOwnResolverQueryOptions({ name: name ?? '' }),
    enabled: !!name,
  })
}
