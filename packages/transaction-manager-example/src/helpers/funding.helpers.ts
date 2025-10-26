import { parseEther } from 'viem'
import type { WalletClient } from 'viem'
import { transactionManager, type Signer, type EOATransactionRequest } from '@ens-apps/transaction-manager'

/**
 * Handle smart account funding through the transaction manager singleton
 *
 * This function prepares an unsigned ETH transfer transaction and submits it
 * to the singleton transaction manager for orchestration.
 */
export async function handleSmartAccountFunding(
  formData: {
    smartAccountAddress: string
    amount: string
  },
  params: {
    walletClient: WalletClient | undefined
    publicClient: any  // Required for transaction manager
  }
): Promise<{ txId?: string; error?: string }> {
  // Validation
  const amount = parseFloat(formData.amount)
  if (isNaN(amount) || amount <= 0) {
    return { error: 'Please enter a valid amount' }
  }

  if (!formData.smartAccountAddress) {
    return { error: 'Smart account address not available' }
  }

  if (!params.walletClient) {
    return { error: 'Wallet not connected' }
  }

  // Prepare unsigned transaction (simple ETH transfer)
  const request: EOATransactionRequest = {
    type: 'eoa',
    from: params.walletClient.account!.address,
    to: formData.smartAccountAddress as `0x${string}`,
    value: parseEther(formData.amount),
    data: '0x' as `0x${string}`,
  }

  // Create EOA signer
  const signer: Signer = {
    type: 'eoa',
    walletClient: params.walletClient,
  }

  // Start transaction through singleton manager
  // Pass publicClient in options (SSR-safe - no global state)
  const txId = transactionManager.startTransaction(request, signer, {
    modal: {
      title: 'Fund Smart Account',
      description: `Sending ${formData.amount} ETH to your smart account`,
      ctaLabel: 'Send ETH',
    },
    publicClient: params.publicClient,
  })

  return { txId }
}
