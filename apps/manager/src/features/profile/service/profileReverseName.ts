import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

const REVERSE_RESOLVER_ADDRESS = '0x01a552795cdb65c5f5f0392a9d1b7f419ac9acd8'

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
    return yield* new MissingReverseNameError()
  }

  return ok(name)
})

export const profileReverseNameQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    meta: { persist: true },
    queryFn: address
      ? ({ queryKey: [{ address }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getReverseName(address!)
      : skipToken,
  })
