import { ResultAsync, errAsync, fromPromise } from 'neverthrow'
import type { Hash, PublicClient, WalletClient, TransactionReceipt } from 'viem'
import type {
  TransactionRequest,
  EOATransactionRequest,
  ERC4337UserOperation,
  TransactionResult
} from '../types/transaction.types'
import {
  TransactionSubmissionError,
  TransactionTimeoutError,
  UserOperationError,
  EthCallFallbackError
} from '../errors/transaction.errors'
import { RhinestoneAccountService, type RhinestoneAccountConfig } from './rhinestone-account.service'

export class TransactionService {
  private rhinestoneService?: RhinestoneAccountService

  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
    rhinestoneConfig?: RhinestoneAccountConfig
  ) {
    if (rhinestoneConfig) {
      this.rhinestoneService = new RhinestoneAccountService(
        publicClient,
        walletClient,
        rhinestoneConfig
      )
    }
  }

  submitTransaction(
    request: TransactionRequest,
    options?: {
      usePrivateMempool?: boolean
    }
  ): ResultAsync<Hash, TransactionSubmissionError | UserOperationError> {
    if (request.type === 'rhinestone-intent') {
      return this.submitRhinestoneIntent(request as any)
    }

    if (request.type === 'erc4337') {
      return this.submitUserOperation(request)
    }

    return this.submitEOATransaction(request, options)
  }

  private submitEOATransaction(
    request: EOATransactionRequest,
    options?: {
      usePrivateMempool?: boolean
    }
  ): ResultAsync<Hash, TransactionSubmissionError> {
    if (!this.walletClient) {
      return errAsync(new TransactionSubmissionError(
        request,
        new Error('No wallet client available')
      ))
    }

    if (options?.usePrivateMempool) {
      return this.submitToPrivateMempool(request)
    }

    // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
    const txParams: any = {
      account: request.from,
      to: request.to,
      value: request.value,
      data: request.data,
      gas: request.gas,
      nonce: request.nonce,
      chain: this.walletClient.chain
    }

    // Use either legacy or EIP-1559 gas pricing (not both)
    if (request.maxFeePerGas !== undefined) {
      txParams.maxFeePerGas = request.maxFeePerGas
      txParams.maxPriorityFeePerGas = request.maxPriorityFeePerGas
    } else if (request.gasPrice !== undefined) {
      txParams.gasPrice = request.gasPrice
    }

    return fromPromise(
      this.walletClient.sendTransaction(txParams),
      (error) => new TransactionSubmissionError(request, error)
    )
  }

  private submitRhinestoneIntent(
    request: any
  ): ResultAsync<Hash, TransactionSubmissionError> {
    console.log('📤 Submitting Rhinestone intent transaction...')

    if (!this.rhinestoneService) {
      console.error('❌ No Rhinestone service configured')
      return errAsync(new TransactionSubmissionError(
        request,
        new Error('Rhinestone service not configured. Please provide rhinestoneConfig.')
      ))
    }

    if (!request.rhinestoneParams) {
      console.error('❌ No Rhinestone params provided')
      return errAsync(new TransactionSubmissionError(
        request,
        new Error('rhinestoneParams required for Rhinestone transactions')
      ))
    }

    return ResultAsync.fromSafePromise(
      this.rhinestoneService.executeENSRenewal(request.rhinestoneParams)
    )
      .andThen(result => result)
      .mapErr(error => new TransactionSubmissionError(request, error))
  }

  private submitUserOperation(
    userOp: ERC4337UserOperation
  ): ResultAsync<Hash, UserOperationError> {
    // Simplified 4337 implementation - in production this would use a bundler client
    return fromPromise(
      this.submit4337Operation(userOp),
      (error) => new UserOperationError(userOp, error)
    )
  }

  private async submit4337Operation(userOp: ERC4337UserOperation): Promise<Hash> {
    // This is a placeholder - real implementation would:
    // 1. Connect to a bundler service
    // 2. Submit the user operation
    // 3. Return the user operation hash

    // Fallback bundler URL - in production, pass this via RhinestoneConfig
    const bundlerUrl = 'http://localhost:4337'

    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendUserOperation',
        params: [
          {
            sender: userOp.from,
            nonce: '0x0', // Should get from entrypoint
            initCode: '0x',
            callData: userOp.callData,
            callGasLimit: userOp.callGasLimit.toString(),
            verificationGasLimit: userOp.verificationGasLimit.toString(),
            preVerificationGas: userOp.preVerificationGas.toString(),
            maxFeePerGas: userOp.maxFeePerGas.toString(),
            maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
            paymasterAndData: userOp.paymasterAndData || '0x',
            signature: userOp.signature || '0x'
          },
          userOp.entryPoint
        ],
        id: 1
      })
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message)
    }

    return data.result as Hash
  }

  private submitToPrivateMempool(
    request: EOATransactionRequest
  ): ResultAsync<Hash, TransactionSubmissionError> {
    // Placeholder for Flashbots Protect or similar
    // In production, this would use the Flashbots RPC endpoint
    return this.submitEOATransaction(request)
  }

  waitForReceipt(
    hash: Hash,
    options?: {
      confirmations?: number
      timeout?: number
    }
  ): ResultAsync<TransactionReceipt, TransactionTimeoutError> {
    const confirmations = options?.confirmations || 1
    const timeout = options?.timeout || 60000

    return fromPromise(
      this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations,
        timeout
      }),
      (error) => new TransactionTimeoutError(hash, timeout)
    )
  }

  checkWithEthCall(
    request: TransactionRequest
  ): ResultAsync<{ wouldSucceed: boolean; result?: Hash }, EthCallFallbackError> {
    if (request.type === 'erc4337') {
      // For 4337, we'd simulate the user operation
      return ResultAsync.fromSafePromise(Promise.resolve({ wouldSucceed: true }))
    }

    const eoaRequest = request as EOATransactionRequest

    return fromPromise(
      this.publicClient.call({
        account: eoaRequest.from,
        to: eoaRequest.to,
        data: eoaRequest.data,
        value: eoaRequest.value,
        gas: eoaRequest.gas
      }).then(result => ({
        wouldSucceed: !result.data?.includes('0x08c379a0'), // Check for revert
        result: result.data
      })),
      (error) => new EthCallFallbackError(request, error)
    )
  }

  async getUserOperationReceipt(userOpHash: Hash): Promise<TransactionReceipt | null> {
    // Placeholder for 4337 receipt fetching
    // Fallback bundler URL - in production, pass this via RhinestoneConfig
    const bundlerUrl = 'http://localhost:4337'

    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
        id: 1
      })
    })

    const data = await response.json()

    if (data.error || !data.result) {
      return null
    }

    // Convert bundler receipt to standard receipt format
    return {
      transactionHash: data.result.transactionHash,
      blockNumber: BigInt(data.result.blockNumber),
      status: data.result.success ? 'success' : 'reverted'
    } as TransactionReceipt
  }
}