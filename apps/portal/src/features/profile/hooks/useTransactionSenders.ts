import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { getTransaction } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

type GetTransactionSendersParameters = {
  transactionHashes: Hash[]
}

const normalizeHashes = (transactionHashes: Hash[]) =>
  [...new Set(transactionHashes)].sort()

const getTransactionSenders = ResultFn(async function* ({
  transactionHashes,
}: GetTransactionSendersParameters) {
  const client = yield* safeGetClient()

  const results = await Promise.allSettled(
    transactionHashes.map(async (hash) => {
      const tx = await getTransaction(client, { hash })
      return { hash, from: tx.from }
    }),
  )

  const senders = new Map<Hash, Address>()
  for (const result of results) {
    if (result.status === 'fulfilled') {
      senders.set(result.value.hash, result.value.from)
    }
  }

  return ok(senders)
})

const getTransactionSendersQueryKey = createQueryKey<
  'getTransactionSendersQueryKey',
  GetTransactionSendersParameters
>('getTransactionSendersQueryKey')

const getTransactionSendersQueryOptions = ({
  transactionHashes,
}: GetTransactionSendersParameters) =>
  resultQueryOptions({
    queryKey: getTransactionSendersQueryKey({
      transactionHashes: normalizeHashes(transactionHashes),
    }),
    queryFn: ({ queryKey: [, params] }) => getTransactionSenders(params),
  })

export const useTransactionSenders = ({
  enabled = true,
  ...params
}: GetTransactionSendersParameters & { readonly enabled?: boolean }) =>
  useQuery({ ...getTransactionSendersQueryOptions(params), enabled })
