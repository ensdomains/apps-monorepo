import { PERMIT2_ADDRESS } from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import { type Address, erc20Abi, maxUint256 } from 'viem'
import { l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'

/** What paying from an L2 needs on top of USDC: a one-off Permit2 approval, paid in ETH. */
export type L2ApprovalGas = Readonly<{
  /** USDC the owner has already approved to Permit2. */
  allowance: bigint
  ethBalance: bigint
  /** What the approval would cost now, in wei. */
  approvalCost: bigint
}>

type L2ApprovalGasByChain = Record<number, L2ApprovalGas | null>

// The same approve call the payment sends, so the estimate matches it.
const readApprovalGas = (
  owner: Address,
  { chain, usdc, client }: L2Source,
): ResultAsync<readonly [number, L2ApprovalGas | null], never> =>
  ResultAsync.fromPromise(
    Promise.all([
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, PERMIT2_ADDRESS],
      }),
      client.getBalance({ address: owner }),
      client.estimateContractGas({
        account: owner,
        address: usdc,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PERMIT2_ADDRESS, maxUint256],
      }),
      client.estimateFeesPerGas(),
    ]),
    () => null,
  )
    .map(
      ([allowance, ethBalance, gas, fees]): readonly [
        number,
        L2ApprovalGas | null,
      ] => [
        chain.id,
        { allowance, ethBalance, approvalCost: gas * fees.maxFeePerGas },
      ],
    )
    .orElse(() => okAsync([chain.id, null] as const))

/** Per L2 chain id; `null` where a read failed, which never blocks a payment. */
export const getL2ApprovalGasQueryOptions = (owner: Address | undefined) =>
  resultQueryOptions({
    queryKey: $qk({ $scope: 'wallet', $action: 'l2-approval-gas', owner }),
    queryFn: () =>
      owner
        ? ResultAsync.combine(
            l2Sources.map((source) => readApprovalGas(owner, source)),
          ).map((entries): L2ApprovalGasByChain => Object.fromEntries(entries))
        : okAsync<L2ApprovalGasByChain>({}),
    enabled: !!owner && l2Sources.length > 0,
    refetchInterval: 30_000,
  })
