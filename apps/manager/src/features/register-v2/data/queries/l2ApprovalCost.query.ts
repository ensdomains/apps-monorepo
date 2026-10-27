import { PERMIT2_ADDRESS } from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync, ResultAsync } from 'neverthrow'
import { type Address, encodeFunctionData, erc20Abi, maxUint256 } from 'viem'
import { estimateL1Fee } from 'viem/op-stack'
import type { L2Source } from '@/l2Sources'

const APPROVE_ARGS = [PERMIT2_ADDRESS, maxUint256] as const

// The approve the payment sends. OP-stack chains add an L1 data fee on top of
// L2 gas; it is estimated apart because the combined estimate refuses a 0 ETH wallet.
const estimateApprovalCost = async (owner: Address, source: L2Source) => {
  const { client, chain, usdc } = source
  const [gas, fees] = await Promise.all([
    client.estimateContractGas({
      account: owner,
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: APPROVE_ARGS,
    }),
    client.estimateFeesPerGas(),
  ])
  const l1Fee = chain.contracts?.gasPriceOracle
    ? await estimateL1Fee(client, {
        account: owner,
        chain,
        to: usdc,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: APPROVE_ARGS,
        }),
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      })
    : 0n
  return gas * fees.maxFeePerGas + l1Fee
}

/** What the one-off Permit2 approval on `source` costs now, in wei; `null` if it can't be estimated. */
export const getL2ApprovalCostQueryOptions = (
  owner: Address | undefined,
  source: L2Source | undefined,
) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'l2-approval-cost',
      owner,
      chainId: source?.chain.id ?? null,
    }),
    queryFn: () =>
      owner && source
        ? ResultAsync.fromPromise(
            estimateApprovalCost(owner, source),
            () => null,
          ).orElse(() => okAsync(null))
        : okAsync(null),
    enabled: !!owner && !!source,
    refetchInterval: 30_000,
  })
