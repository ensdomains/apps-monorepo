import { getConnectorClient } from '@wagmi/core'
import type { Address } from 'viem'
import { chain } from '@/config'
import { publicClient, wagmiConfig } from '@/lib/wagmi'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { followChain } from '@/lib/wallet/followChain'
import {
  assertFreshEthQuote,
  buildEthSwapCall,
  getEthSwapQuote,
} from './ethPayment'

/** Convert native ETH into the exact USDC amount the existing registration needs. */
export const executeEthPayment = async (
  owner: Address,
  amountOut: bigint,
): Promise<void> => {
  // Always quote again at click time. A quote shown before a wallet prompt must
  // never silently become permission to spend a newly computed, larger amount.
  const wallet = await followChain(
    await getConnectorClient(wagmiConfig, {
      account: owner,
      assertChainId: false,
      chainId: chain.id,
    }),
    chain,
    (chainId) => ensureWalletChain(wagmiConfig, chainId),
  )
  if (
    !wallet.account ||
    wallet.account.address.toLowerCase() !== owner.toLowerCase()
  ) {
    throw new Error('The connected wallet changed. Reconnect and try again.')
  }

  const quote = await getEthSwapQuote(amountOut)
  assertFreshEthQuote(quote)
  const call = buildEthSwapCall(quote, owner)

  const [balance, gas, gasPrice] = await Promise.all([
    publicClient.getBalance({ address: owner }),
    publicClient.estimateGas({ ...call, account: owner }),
    publicClient.getGasPrice(),
  ])
  // Reserve twice the current estimated gas cost; a swap cannot consume the
  // ETH needed to submit itself or continue registration.
  if (balance < call.value + gas * gasPrice * 2n) {
    throw new Error('Not enough ETH for the swap and network fees.')
  }

  const hash = await wallet.sendTransaction({
    ...call,
    account: wallet.account,
    chain,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success')
    throw new Error('The ETH swap failed on-chain.')
}
