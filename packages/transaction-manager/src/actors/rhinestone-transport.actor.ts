import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash } from 'viem'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { PimlicoSigner, RhinestoneSigner } from '../types/signer.types'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Rhinestone Transport Actor
 *
 * Submits Rhinestone transactions via permissionless.js with Pimlico.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 *
 * The actor accepts generic contract calls and executes them through the
 * Rhinestone Nexus smart account, using Pimlico for bundling and sponsorship.
 */
// export function submitRhinestoneTransaction(input: {
//   request: TransactionRequest
//   signer: RhinestoneSigner
//   publicClient: PublicClient
// }): ResultAsync<Hash, TransactionSubmissionError> {
//   const { request, signer, publicClient } = input
//   const { account, config } = signer
//   const rhinestoneRequest = request as RhinestoneTransactionRequest

//   console.log('🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone transaction:', {
//     accountAddress: account?.getAddress?.(),
//     hasParams: !!rhinestoneRequest.rhinestoneParams,
//     callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
//   })

//   if (!rhinestoneRequest.rhinestoneParams) {
//     console.error('❌ [RHINESTONE TRANSPORT] Missing rhinestoneParams')
//     return errAsync(
//       new TransactionSubmissionError(
//         rhinestoneRequest,
//         new Error('rhinestoneParams required for Rhinestone transactions'),
//       ),
//     )
//   }

//   if (
//     !rhinestoneRequest.rhinestoneParams.calls ||
//     rhinestoneRequest.rhinestoneParams.calls.length === 0
//   ) {
//     console.error('❌ [RHINESTONE TRANSPORT] Missing or empty calls array')
//     return errAsync(
//       new TransactionSubmissionError(
//         rhinestoneRequest,
//         new Error('rhinestoneParams.calls is required and must not be empty'),
//       ),
//     )
//   }

//   const chain = config.chain || sepolia
//   const sponsored = rhinestoneRequest.rhinestoneParams.sponsored ?? false
//   const safeAccountAddress = account?.getAddress?.()

//   if (!safeAccountAddress) {
//     console.error('❌ [RHINESTONE TRANSPORT] No account address available')
//     return errAsync(
//       new TransactionSubmissionError(
//         rhinestoneRequest,
//         new Error('Rhinestone account address not available'),
//       ),
//     )
//   }

//   console.log('🔧 [RHINESTONE TRANSPORT] Executing with permissionless:', {
//     accountAddress: safeAccountAddress,
//     calls: rhinestoneRequest.rhinestoneParams.calls,
//     sponsored,
//   })

//   // Execute the transaction through permissionless with Pimlico
//   return fromPromise(
//     (async () => {
//       const walletClient = config.walletClient
//       if (!walletClient?.account?.address) {
//         throw new Error('Invalid walletClient')
//       }

//       // Setup Pimlico (using new unified client)
//       const pimlicoUrl = `https://api.pimlico.io/v2/${chain.name.toLowerCase()}/rpc?apikey=${config.pimlicoApiKey}`

//       const pimlicoClient = createPimlicoClient({
//         transport: http(pimlicoUrl),
//         entryPoint: {
//           address: entryPoint07Address,
//           version: '0.7',
//         },
//       })

//       // Create Safe account with new API
//       const safeAccount = await toSafeSmartAccount({
//         client: publicClient,
//         owners: [walletClient], // Pass walletClient as owner
//         entryPoint: {
//           address: entryPoint07Address,
//           version: '0.7',
//         },
//         version: '1.4.1', // Safe version
//         saltNonce: 0n, // Deterministic address
//       })

//       console.log('✅ Safe account created:', {
//         address: safeAccount.address,
//         // Note: This will be different from safeAccountAddress
//       })

//       // Create smart account client
//       const smartAccountClient = createSmartAccountClient({
//         account: safeAccount,
//         chain: chain as Chain,
//         bundlerTransport: http(pimlicoUrl),
//         paymaster: sponsored ? pimlicoClient : undefined,
//         userOperation: sponsored
//           ? {
//             estimateFeesPerGas: async () =>
//               (await pimlicoClient.getUserOperationGasPrice()).fast,
//           }
//           : undefined,
//       })

//       // Send transaction with new API
//       const txHash = await smartAccountClient.sendTransaction({
//         calls: rhinestoneRequest.rhinestoneParams.calls,
//       })

//       console.log('✅ Transaction hash:', txHash)
//       return txHash
//     })(),
//     (error) => {
//       console.error('❌ Transaction failed:', error)
//       return new TransactionSubmissionError(rhinestoneRequest, error as Error)
//     },
//   )
// }

/**
 * Rhinestone Transport Actor (Original SDK implementation)
 *
 * Submits transactions via Rhinestone SDK.
 * This is the original implementation preserved for backward compatibility.
 */
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  signer: RhinestoneSigner
  publicClient?: any
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log('🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone transaction:', {
    accountAddress: signer.account?.getAddress?.(),
    hasParams: !!rhinestoneRequest.rhinestoneParams,
    callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
  })

  if (!rhinestoneRequest.rhinestoneParams) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams required for Rhinestone transactions'),
      ),
    )
  }

  if (
    !rhinestoneRequest.rhinestoneParams.calls ||
    rhinestoneRequest.rhinestoneParams.calls.length === 0
  ) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  // Use Rhinestone SDK's sendTransaction method
  // Based on the actual SDK API: rhinestoneAccount.sendTransaction({ chain, calls })
  return fromPromise(
    (async () => {
      const chain = signer.config.chain
      if (!chain) {
        throw new Error('Chain is required in Rhinestone config')
      }

      // Rhinestone SDK uses sendTransaction with config object
      const transaction = await signer.account.sendTransaction({
        chain,
        calls: rhinestoneRequest.rhinestoneParams.calls,
      })

      // Wait for execution and extract hash
      const transactionResult =
        await signer.account.waitForExecution(transaction)

      // Extract hash from result
      let txHash: string | null = null
      if (transactionResult && typeof transactionResult === 'object') {
        const result = transactionResult as unknown as Record<string, unknown>
        if (
          'fillTransactionHash' in result &&
          typeof result.fillTransactionHash === 'string'
        ) {
          txHash = result.fillTransactionHash
        } else if (
          'transactionHash' in result &&
          typeof result.transactionHash === 'string'
        ) {
          txHash = result.transactionHash
        } else if (
          'result' in result &&
          result.result &&
          typeof result.result === 'object'
        ) {
          const nestedResult = result.result as Record<string, unknown>
          if (
            nestedResult.transactionHash &&
            typeof nestedResult.transactionHash === 'string'
          ) {
            txHash = nestedResult.transactionHash
          }
        } else if ('hash' in result && typeof result.hash === 'string') {
          txHash = result.hash
        }
      }

      if (!txHash) {
        throw new Error(
          'Failed to extract transaction hash from Rhinestone result',
        )
      }

      console.log('✅ [RHINESTONE TRANSPORT] Transaction submitted:', txHash)
      return txHash as Hash
    })(),
    (error) => {
      console.error('❌ [RHINESTONE TRANSPORT] Transaction failed:', error)
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    },
  )
}

/**
 * Pimlico Transport Actor
 *
 * Submits transactions via permissionless SmartAccountClient (Para + Pimlico).
 * The smart account client is created in useRhinestoneAccount hook.
 * This actor simply forwards calls to the pre-configured client.
 */
export function submitPimlicoTransaction(input: {
  request: TransactionRequest
  signer: PimlicoSigner
  publicClient?: any // Optional, not used in new architecture
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log('🔧 [PIMLICO TRANSPORT] Submitting transaction:', {
    hasParams: !!rhinestoneRequest.rhinestoneParams,
    callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
  })

  if (!rhinestoneRequest.rhinestoneParams) {
    console.error('❌ [PIMLICO TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams required for Pimlico transactions'),
      ),
    )
  }

  if (
    !rhinestoneRequest.rhinestoneParams.calls ||
    rhinestoneRequest.rhinestoneParams.calls.length === 0
  ) {
    console.error('❌ [PIMLICO TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  // The smart account client is already set up in useRhinestoneAccount hook
  // It's configured with Para account as owner and Pimlico for bundling/sponsorship
  const smartAccountClient = signer.account

  if (!smartAccountClient) {
    console.error('❌ [PIMLICO TRANSPORT] Smart account client not found')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error(
          'Smart account not initialized. Ensure useRhinestoneAccount hook has completed.',
        ),
      ),
    )
  }

  // Check if smartAccountClient has sendTransaction method
  if (typeof smartAccountClient.sendTransaction !== 'function') {
    console.error('❌ [PIMLICO TRANSPORT] Invalid smart account client')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('Smart account client does not have sendTransaction method'),
      ),
    )
  }

  return fromPromise(
    (async () => {
      console.log(
        '📤 [PIMLICO TRANSPORT] Sending user operation via smart account client:',
        {
          callCount: rhinestoneRequest.rhinestoneParams.calls.length,
          calls: rhinestoneRequest.rhinestoneParams.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      // Use sendUserOperation for sponsored transactions with Pimlico
      // This ensures proper paymaster integration
      const userOpHash = await smartAccountClient.sendUserOperation({
        calls: rhinestoneRequest.rhinestoneParams.calls,
      })

      console.log('✅ [PIMLICO TRANSPORT] User operation hash:', userOpHash)

      // Wait for the user operation receipt to get the transaction hash
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      // Extract the transaction hash from the receipt
      const txHash = receipt.receipt.transactionHash

      console.log('✅ [PIMLICO TRANSPORT] Transaction submitted:', txHash)
      return txHash as Hash
    })(),
    (error) => {
      console.error('❌ [PIMLICO TRANSPORT] Transaction failed:', error)
      console.error('❌ [PIMLICO TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
        stack: (error as Error)?.stack,
      })
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    },
  )
}
