import { encodeFunctionData, erc20Abi, type PublicClient } from 'viem'
import { encodeGraceRenewal, type GraceRenewalQuote } from './graceRenewal'

export type GraceRenewalGasEstimate = {
  readonly gasUnits: bigint
  readonly transactionCount: number
  readonly approvalRequired: boolean
}

type EstimateGraceRenewalGasParameters = {
  readonly quote: GraceRenewalQuote
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}

// A preview may precede the wallet confirmations by several blocks. Keep a
// 20% margin over the RPC's measured gas instead of treating it as a guarantee.
const withGasMargin = (gas: bigint): bigint => (gas * 120n + 99n) / 100n

export const estimateGraceRenewalGas = async ({
  quote,
  publicClient,
  signal,
}: EstimateGraceRenewalGasParameters): Promise<GraceRenewalGasEstimate> => {
  signal?.throwIfAborted()
  if (publicClient.chain?.id !== quote.chainId) {
    throw new Error('Switch to the migration network and try again.')
  }
  if (quote.items.every(({ duration }) => duration === 0n)) {
    return { gasUnits: 0n, transactionCount: 0, approvalRequired: false }
  }

  const allowance = await publicClient.readContract({
    address: quote.paymentToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [quote.ownerAddress, quote.renewerAddress],
  })
  signal?.throwIfAborted()
  const renewal = {
    to: quote.renewerAddress,
    data: encodeGraceRenewal(quote),
  }
  const approvalRequired = allowance < quote.totalAmount

  if (!approvalRequired) {
    const gas = await publicClient.estimateGas({
      account: quote.ownerAddress,
      ...renewal,
    })
    signal?.throwIfAborted()
    if (gas <= 0n) throw new Error('Could not estimate renewal network fees.')
    return {
      gasUnits: withGasMargin(gas),
      transactionCount: 1,
      approvalRequired: false,
    }
  }

  // eth_simulateV1 preserves state between these calls, so renewal can be
  // measured before approval exists on-chain. Both calls are read-only RPC
  // simulations; no wallet request or transaction is submitted.
  const { results } = await publicClient.simulateCalls({
    account: quote.ownerAddress,
    calls: [
      {
        to: quote.paymentToken,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [quote.renewerAddress, quote.totalAmount],
        }),
      },
      renewal,
    ],
    validation: false,
  })
  signal?.throwIfAborted()
  if (results.length !== 2) {
    throw new Error('Could not estimate renewal network fees.')
  }
  const gas = results.reduce((total, result) => {
    if (result.status === 'failure') throw result.error
    if (result.gasUsed <= 0n) {
      throw new Error('Could not estimate renewal network fees.')
    }
    return total + result.gasUsed
  }, 0n)
  return {
    gasUnits: withGasMargin(gas),
    transactionCount: 2,
    approvalRequired: true,
  }
}
