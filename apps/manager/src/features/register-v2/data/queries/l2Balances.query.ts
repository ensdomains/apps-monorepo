import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import { type Address, erc20Abi } from 'viem'
import { l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'
import { l2PublicClients } from '@/lib/wagmi'

type L2Balances = Record<number, bigint | null>

// A failed read is `null`, so one unreachable L2 doesn't hide the others.
const readL2Balance = (
  owner: Address,
  { chain, usdc }: L2Source,
): ResultAsync<readonly [number, bigint | null], never> => {
  const client = l2PublicClients.get(chain.id)
  if (!client) return okAsync([chain.id, null])
  return ResultAsync.fromPromise(
    client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    }),
    () => null,
  )
    .map((balance): readonly [number, bigint | null] => [chain.id, balance])
    .orElse(() => okAsync([chain.id, null] as const))
}

/** The owner's USDC on each L2 source by chain id; `null` where a read failed. */
export const getL2Balances = (owner: Address): ResultAsync<L2Balances, never> =>
  ResultAsync.combine(
    l2Sources.map((source) => readL2Balance(owner, source)),
  ).map((entries): L2Balances => Object.fromEntries(entries))

export const getL2BalancesQueryOptions = (owner: Address | undefined) =>
  resultQueryOptions({
    queryKey: $qk({ $scope: 'wallet', $action: 'l2-usdc-balances', owner }),
    queryFn: () => (owner ? getL2Balances(owner) : okAsync<L2Balances>({})),
    enabled: !!owner && l2Sources.length > 0,
    refetchInterval: 30_000,
  })
