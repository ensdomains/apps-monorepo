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
 *
 * The question is "does the registry holding this name name a resolver on the
 * name's own slot", so it is asked of that registry, which differs by protocol
 * version (WEB-125):
 *
 * - **ENSv1** — the legacy `ENSRegistry.resolver(node)`. The UniversalResolver
 *   cannot answer for these: it walks the v2 registry, where a v1 name has no
 *   slot, and reports the composite mirror resolver bound to the name's TLD
 *   instead. For a DNS 2LD that mirror sits at the TLD, so every imported DNS
 *   name looked like it inherited its resolver and no record edit was ever
 *   offered — including to the manager, whom the resolver does authorise.
 * - **ENSv2** — the UniversalResolver walk, whose stopping offset says whether
 *   the resolver belongs to the name or to an ancestor.
 */

import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { registryResolverSnippet } from '@ensdomains/ensjs-abi/registry'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { namehash, parseAbi, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { universalResolverAddress } from '@/lib/constants/universalResolver'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { dnsEncodeName } from '@/utils/token/dnsEncodeName'
import type { ProtocolVersion } from '@/utils/types'

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
  readonly protocolVersion: ProtocolVersion
}

export const getNameHasOwnResolver = ResultFn(async function* ({
  name,
  protocolVersion,
}: GetNameHasOwnResolverParams) {
  const client = yield* safeGetClient()

  const call = getAction(client, readContract, 'readContract')

  if (protocolVersion === 'ENSv1') {
    // Route-supplied, so normalise before hashing — an unnormalised spelling
    // hashes to a different node than the one every other v1 read uses.
    const node = yield* fromSync(
      () => namehash(normalize(name)),
      (e) => new GetNameHasOwnResolverError({ cause: e }),
    )

    const resolver = yield* fromPromise(
      call({
        address: getChainContractAddress({
          chain: client.chain,
          contract: 'ensLegacyRegistry',
        }),
        abi: registryResolverSnippet,
        functionName: 'resolver',
        args: [node],
      }),
      (e) => new GetNameHasOwnResolverError({ cause: e }),
    )

    // The legacy registry has no wildcards: a slot either names a resolver or
    // the name inherits whatever answers for it, which takes no writes.
    return ok(resolver !== zeroAddress)
  }

  const [resolver, , offset] = yield* fromPromise(
    call({
      address: universalResolverAddress,
      abi: findResolverAbi,
      functionName: 'findResolver',
      args: [dnsEncodeName(name)],
    }),
    (e) => new GetNameHasOwnResolverError({ cause: e }),
  )

  // Going through the UniversalResolver rather than reading a registry directly
  // needs no list of known resolver deployments — a custom or per-name resolver
  // answers here exactly as the public one does.
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
  /** Which registry to ask. Undefined keeps the query idle. */
  protocolVersion: ProtocolVersion | undefined
}

/**
 * @returns `true` when the name's own registry entry names a resolver, `false`
 * when the resolver answering for it is inherited or absent.
 */
export function useNameHasOwnResolver({
  name,
  protocolVersion,
}: UseNameHasOwnResolverParams) {
  return useQuery({
    ...getNameHasOwnResolverQueryOptions({
      name: name ?? '',
      protocolVersion: protocolVersion ?? 'ENSv2',
    }),
    enabled: !!name && !!protocolVersion,
  })
}
