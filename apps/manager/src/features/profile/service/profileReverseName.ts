import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

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

class MissingReverseNameError extends TaggedError(
  'MissingReverseNameError',
)<{}> {}

export const getReverseName = ResultFn(async function* (address: Address) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    readContract(client, {
      address: REVERSE_RESOLVER_ADDRESS,
      abi: REVERSE_RESOLVER_ABI,
      functionName: 'resolveNames',
      args: [[address]],
    }),
    (e) => new ReverseResolverError({ cause: e }),
  )

  const [name] = result ?? []

  if (!name) {
    return yield* new MissingReverseNameError({
      cause: new Error('No reverse name found'),
    })
  }

  return ok(name)
})

export const profileReverseNameQuery = (address: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    queryFn: ({ queryKey: [{ address }] }) => getReverseName(address),
  })
