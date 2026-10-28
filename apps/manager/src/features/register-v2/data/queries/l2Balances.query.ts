import { PERMIT2_ADDRESS } from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import { type Address, erc20Abi } from 'viem'
import { l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'

/** The owner's wallet on one L2: USDC, what Permit2 may already move, and ETH for gas. */
export type L2Wallet = Readonly<{
  usdc: bigint
  permit2Allowance: bigint
  eth: bigint
}>

type L2Wallets = Record<number, L2Wallet | null>

// A failed read is `null`, so one unreachable L2 doesn't hide the others.
const readL2Wallet = (
  owner: Address,
  { chain, usdc, client }: L2Source,
): ResultAsync<readonly [number, L2Wallet | null], never> =>
  ResultAsync.fromPromise(
    Promise.all([
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      }),
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, PERMIT2_ADDRESS],
      }),
      client.getBalance({ address: owner }),
    ]),
    () => null,
  )
    .map(
      ([usdcBalance, permit2Allowance, eth]): readonly [
        number,
        L2Wallet | null,
      ] => [chain.id, { usdc: usdcBalance, permit2Allowance, eth }],
    )
    .orElse(() => okAsync([chain.id, null] as const))

/** The owner's wallet on each L2 source by chain id; `null` where a read failed. */
export const getL2Wallets = (owner: Address): ResultAsync<L2Wallets, never> =>
  ResultAsync.combine(
    l2Sources.map((source) => readL2Wallet(owner, source)),
  ).map((entries): L2Wallets => Object.fromEntries(entries))

export const getL2BalancesQueryOptions = (owner: Address | undefined) =>
  resultQueryOptions({
    queryKey: $qk({ $scope: 'wallet', $action: 'l2-usdc-balances', owner }),
    queryFn: () => (owner ? getL2Wallets(owner) : okAsync<L2Wallets>({})),
    enabled: !!owner && l2Sources.length > 0,
    refetchInterval: 30_000,
  })
