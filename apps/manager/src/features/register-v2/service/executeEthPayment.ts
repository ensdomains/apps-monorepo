import { getDestinationContracts } from '@ens-apps/smart-account'
import { getConnectorClient } from '@wagmi/core'
import { type Address, erc20Abi, type Hash, isHex } from 'viem'
import { chain } from '@/config'
import { publicClient, wagmiConfig } from '@/lib/wagmi'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { followChain } from '@/lib/wallet/followChain'
import {
  assertFreshEthQuote,
  buildEthSwapCall,
  getEthSwapQuote,
} from './ethPayment'

const pendingKey = (owner: Address) =>
  `ens-eth-payment:${chain.id}:${owner.toLowerCase()}`

const readPendingSwap = (owner: Address): Hash | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const stored = localStorage.getItem(pendingKey(owner))
    if (!stored || !isHex(stored) || stored.length !== 66) return null
    return stored
  } catch {
    return null
  }
}

export const hasPendingEthPayment = (owner: Address): boolean =>
  readPendingSwap(owner) !== null

const confirmSwap = async (
  owner: Address,
  hash: Hash,
  amountOut: bigint,
): Promise<void> => {
  let replacementReason: 'cancelled' | 'replaced' | 'repriced' | undefined
  let receipt: Awaited<
    ReturnType<typeof publicClient.waitForTransactionReceipt>
  >
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash,
      onReplaced: ({ reason }) => {
        replacementReason = reason
      },
    })
  } catch {
    // The submitted transaction may still land. Keep its hash and make a retry
    // wait for it instead of prompting for another ETH payment.
    throw new Error(
      'The ETH swap is still pending. Wait for it to confirm, then try again.',
    )
  }
  if (replacementReason === 'cancelled') {
    localStorage.removeItem(pendingKey(owner))
    throw new Error('The ETH swap was cancelled. You can try again.')
  }
  if (receipt.status !== 'success') {
    localStorage.removeItem(pendingKey(owner))
    throw new Error('The ETH swap failed on-chain.')
  }
  if (replacementReason === 'replaced') {
    // A different transaction only counts if the wallet actually has the USDC
    // needed to continue. If this read fails, retain the hash for a safe retry.
    const balance = await publicClient.readContract({
      address: getDestinationContracts(chain.id).usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    })
    if (balance < amountOut) {
      localStorage.removeItem(pendingKey(owner))
      throw new Error(
        'The wallet replaced the ETH swap without funding enough USDC. Try again.',
      )
    }
  }
  localStorage.removeItem(pendingKey(owner))
}

/** Convert native ETH into the exact USDC amount the existing registration needs. */
export const executeEthPayment = async (
  owner: Address,
  amountOut: bigint,
  displayedMaximumEth?: bigint,
): Promise<void> => {
  const pending = readPendingSwap(owner)
  if (pending) return confirmSwap(owner, pending, amountOut)
  if (displayedMaximumEth === undefined) {
    throw new Error('The ETH quote is unavailable. Refresh it and try again.')
  }

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
  if (quote.maximumEth > displayedMaximumEth) {
    throw new Error('The ETH price changed. Refresh the quote and try again.')
  }
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

  // A submitted swap must be resumable after a reload or RPC interruption.
  // Verify that storage accepts writes before asking the wallet to send ETH.
  const storageProbe = `${pendingKey(owner)}:probe`
  try {
    localStorage.setItem(storageProbe, '1')
    if (localStorage.getItem(storageProbe) !== '1')
      throw new Error('Storage read failed')
    localStorage.removeItem(storageProbe)
  } catch {
    throw new Error('Browser storage is unavailable. Enable it and try again.')
  }

  const hash = await wallet.sendTransaction({
    ...call,
    account: wallet.account,
    chain,
  })
  localStorage.setItem(pendingKey(owner), hash)
  await confirmSwap(owner, hash, amountOut)
}
