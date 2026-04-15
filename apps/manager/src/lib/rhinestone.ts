/**
 * Simple Rhinestone SDK instance - Similar to working snippet
 * Direct, minimal approach without complex hooks
 */

import {
  type CallInput,
  type RhinestoneAccount,
  RhinestoneSDK,
} from '@rhinestone/sdk'
import type { Account, WalletClient } from 'viem'
import { customSepolia } from '@/lib/wagmi'

const createCustomAccount = (walletClient: WalletClient): Account => {
  const account = walletClient.account
  if (!account) {
    throw new Error(
      'WalletClient must have an account to create a custom account',
    )
  }

  return {
    address: account.address,
    type: 'json-rpc',
    async signMessage({
      message,
    }: {
      message: Parameters<WalletClient['signMessage']>[0]['message']
    }) {
      return await walletClient.signMessage({
        account,
        message,
      })
    },
    async signTypedData(typedData: Record<string, unknown>) {
      return await walletClient.signTypedData({
        account,
        ...typedData,
      } as Parameters<WalletClient['signTypedData']>[0])
    },
    async signTransaction(transaction: Record<string, unknown>) {
      return await walletClient.signTransaction({
        account,
        ...transaction,
      } as Parameters<WalletClient['signTransaction']>[0])
    },
  } as unknown as Account
}

export interface RhinestoneTransactionResult {
  transaction: unknown
  result: unknown
  fillTransactionHash: string | null
}

export class RhinestoneService {
  private rhinestoneAccount: RhinestoneAccount | null = null
  private accountAddress: string | null = null

  async initialize(walletClient: WalletClient): Promise<void> {
    try {
      console.log('🔧 Initializing Rhinestone SDK...')

      // Initialize SDK instance
      const sdk = new RhinestoneSDK({
        apiKey: import.meta.env.VITE_RHINESTONE_API_KEY,
      })

      // Create Rhinestone account using custom account
      this.rhinestoneAccount = await sdk.createAccount({
        owners: {
          type: 'ecdsa',
          accounts: [createCustomAccount(walletClient)],
        },
      })

      this.accountAddress = this.rhinestoneAccount.getAddress()
      console.log('✅ Rhinestone account created:', this.accountAddress)
    } catch (error) {
      console.error('❌ Failed to initialize Rhinestone:', error)
      throw error
    }
  }

  async sendTransaction(
    calls: CallInput[],
  ): Promise<RhinestoneTransactionResult> {
    if (!this.rhinestoneAccount) {
      throw new Error('Rhinestone account not initialized')
    }

    try {
      console.log('📤 Sending transaction (simple approach)...')
      console.log('Calls:', calls)

      // Prepare transaction config (same as working snippet)
      const txConfig = {
        chain: customSepolia,
        calls: calls,
      }

      console.log('Transaction config:', txConfig)

      // Send transaction
      const transaction = await this.rhinestoneAccount.sendTransaction(txConfig)
      console.log('📦 Transaction sent:', transaction)

      // Wait for execution
      const transactionResult =
        await this.rhinestoneAccount.waitForExecution(transaction)
      console.log('✅ Transaction executed:', transactionResult)

      // Extract transaction hash (same pattern as working snippet)
      let txHash: string | null = null
      if (transactionResult && typeof transactionResult === 'object') {
        if ('fillTransactionHash' in transactionResult) {
          txHash = transactionResult.fillTransactionHash as string
        } else if ('transactionHash' in transactionResult) {
          txHash = transactionResult.transactionHash as string
        } else if ('result' in transactionResult && transactionResult.result) {
          const result = transactionResult.result as Record<string, unknown>
          if (result.transactionHash) {
            txHash = result.transactionHash as string
          }
        }
      }

      console.log('📝 Transaction hash:', txHash || 'N/A')

      return {
        transaction,
        result: transactionResult,
        fillTransactionHash: txHash,
      }
    } catch (error) {
      console.error('❌ Transaction failed:', error)
      throw error
    }
  }

  getAccountAddress(): string | null {
    return this.accountAddress
  }

  isInitialized(): boolean {
    return this.rhinestoneAccount !== null
  }
}

// Global instance
let rhinestoneService: RhinestoneService | null = null

export function getRhinestoneService(): RhinestoneService {
  if (!rhinestoneService) {
    rhinestoneService = new RhinestoneService()
  }
  return rhinestoneService
}
