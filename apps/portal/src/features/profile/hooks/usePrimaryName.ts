// TEMPORARY: this hook hits a custom batch reverse resolver to cover L2 /
// ENSIP-19 default-reverse paths that the standard Universal Resolver
// `reverse(addr, 60n)` does not yet resolve on Sepolia. Once UR catches up,
// replace this file with `usePrimaryName.canonical.ts` (single `getName` call).

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { publicResolverSingleAddrSnippet } from '@ensdomains/ensjs/contracts'
import { getResolver } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { type Address, namehash } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Batch reverse resolver — not in ensjs chain config or ENS_SEPOLIA_CONTRACTS
const REVERSE_RESOLVER_ADDRESS =
  '0x7cd0016f722f34394110738eec10265b00c6c7d9' as const

const REVERSE_RESOLVER_ABI = [
  {
    inputs: [{ internalType: 'address[]', name: 'addrs', type: 'address[]' }],
    name: 'resolveNames',
    outputs: [{ internalType: 'string[]', name: 'names', type: 'string[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

class PrimaryNameError extends TaggedError('PrimaryNameError')<{
  cause: unknown
}> {}

const getPrimaryName = ResultFn(async function* (address: Address | undefined) {
  if (!address) return ok(null)

  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    readContract(client, {
      address: REVERSE_RESOLVER_ADDRESS,
      abi: REVERSE_RESOLVER_ABI,
      functionName: 'resolveNames',
      args: [[address]],
    }),
    (e) => new PrimaryNameError({ cause: e }),
  )

  const [name] = result ?? []

  if (!name) return ok(null)

  // Forward-confirmed reverse resolution (ENSIP-3):
  // Verify the name's ETH record resolves back to this address.
  const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`

  const resolverAddress = yield* await fromPromise(
    getResolver(client, { name: nameWithEth }),
    (e) => new PrimaryNameError({ cause: e }),
  )

  if (!resolverAddress) return ok(null)

  const forwardAddress = yield* await fromPromise(
    readContract(client, {
      address: resolverAddress,
      abi: publicResolverSingleAddrSnippet,
      functionName: 'addr',
      args: [namehash(nameWithEth)],
    }),
    (e) => new PrimaryNameError({ cause: e }),
  )

  if (!forwardAddress || forwardAddress.toLowerCase() !== address.toLowerCase())
    return ok(null)

  return ok(name)
})

const getPrimaryNameQueryKey = createQueryKey<
  'get-primary-name',
  { address: Address | undefined }
>('get-primary-name')

export const getPrimaryNameQueryOptions = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: getPrimaryNameQueryKey({ address }),
    queryFn: () => getPrimaryName(address),
    enabled: !!address,
  })

const getPrimaryNames = ResultFn(async function* (addresses: Address[]) {
  if (addresses.length === 0) return ok<Record<string, string>>({})

  const client = yield* safeGetClient()

  const names = yield* await fromPromise(
    readContract(client, {
      address: REVERSE_RESOLVER_ADDRESS,
      abi: REVERSE_RESOLVER_ABI,
      functionName: 'resolveNames',
      args: [addresses],
    }),
    (e) => new PrimaryNameError({ cause: e }),
  )

  const byAddress: Record<string, string> = {}
  addresses.forEach((address, index) => {
    const name = names[index]
    if (name) byAddress[address.toLowerCase()] = name
  })

  return ok(byAddress)
})

const getPrimaryNamesQueryKey = createQueryKey<
  'get-primary-names',
  { addresses: Address[] }
>('get-primary-names')

export const getPrimaryNamesQueryOptions = (addresses: Address[]) =>
  resultQueryOptions({
    queryKey: getPrimaryNamesQueryKey({ addresses }),
    queryFn: () => getPrimaryNames(addresses),
    enabled: addresses.length > 0,
  })
