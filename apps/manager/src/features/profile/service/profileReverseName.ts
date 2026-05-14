import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getName } from '@ensdomains/ensjs/public'
import { fromPromise, ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getProfileEthAddressSnapshot } from './profileEthAddress'

const REVERSE_RESOLVER_ADDRESS = '0x7cd0016f722f34394110738eec10265b00c6c7d9'

const REVERSE_RESOLVER_ABI = [
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'addrs',
        type: 'address[]',
      },
    ],
    name: 'resolveNames',
    outputs: [
      {
        internalType: 'string[]',
        name: 'names',
        type: 'string[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

class ReverseResolverError extends TaggedError('ReverseResolverError')<{
  cause: unknown
}> {}

export const getReverseName = ResultFn(async function* (address?: Address) {
  if (!address) return ok(null)

  const client = yield* safeGetClient()

  const result = yield* fromPromise(
    readContract(client, {
      address: REVERSE_RESOLVER_ADDRESS,
      abi: REVERSE_RESOLVER_ABI,
      functionName: 'resolveNames',
      args: [[address]],
    }),
    (e) => new ReverseResolverError({ cause: e }),
  ).orElse(() => okAsync(null))

  const [name] = result ?? []

  if (name) {
    const { ethAddress } = yield* getProfileEthAddressSnapshot(name)

    if (ethAddress?.toLowerCase() === address.toLowerCase()) {
      return ok(name)
    }
  }

  const ensName = yield* fromPromise(
    getName(client, {
      address,
      allowMismatch: true,
    }),
    (e) => new ReverseResolverError({ cause: e }),
  ).orElse(() => okAsync(null))

  if (ensName?.match) {
    return ok(ensName.name)
  }

  return ok(null)
})

export const profileReverseNameQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    queryFn: ({ queryKey: [{ address }] }) => getReverseName(address),
  })
