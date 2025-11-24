/**
 * Simple Rhinestone SDK instance - Similar to working snippet
 * Direct, minimal approach without complex hooks
 */

import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Account } from 'viem'
import { customSepolia } from '@/lib/wagmi'

const createCustomAccount = (walletClient: any): Account => {
  return {
    address: walletClient.account.address,
    type: 'json-rpc',
    async signMessage({ message }: { message: any }) {
      return await walletClient.signMessage({
        account: walletClient.account,
        message,
      })
    },
    async signTypedData(typedData: any) {
      return await walletClient.signTypedData({
        account: walletClient.account,
        ...typedData,
      })
    },
    async signTransaction(transaction: any) {
      return await walletClient.signTransaction({
        account: walletClient.account,
        ...transaction,
      })
    },
  } as unknown as Account
}

export interface RhinestoneTransactionResult {
  transaction: any
  result: any
  fillTransactionHash: string | null
}

export class RhinestoneService {
  private rhinestoneAccount: any = null
  private accountAddress: string | null = null

  async initialize(walletClient: any): Promise<void> {
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

  async sendTransaction(calls: any[]): Promise<RhinestoneTransactionResult> {
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
          txHash = transactionResult.fillTransactionHash
        } else if ('transactionHash' in transactionResult) {
          txHash = transactionResult.transactionHash
        } else if ('result' in transactionResult && transactionResult.result) {
          const result = transactionResult.result as any
          if (result.transactionHash) {
            txHash = result.transactionHash
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
