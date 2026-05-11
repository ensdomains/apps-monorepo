import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Rhinestone Transport Actor
 *
 * Submits Rhinestone intent transactions via the Rhinestone SDK.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 *
 * The actor accepts generic contract calls and executes them through the
 * Rhinestone smart account, which handles chain abstraction and gas sponsorship.
 */
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  signer: RhinestoneSigner
  publicClient: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const { account, config } = signer
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log(
    '🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone intent transaction:',
    {
      accountAddress: account?.getAddress?.(),
      hasParams: !!rhinestoneRequest.rhinestoneParams,
      callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
    },
  )

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

  console.log('🔧 [RHINESTONE TRANSPORT] Executing with Rhinestone account:', {
    accountAddress: account?.getAddress?.(),
    calls: rhinestoneRequest.rhinestoneParams.calls,
  })

  const chain = config.chain || sepolia

  return fromPromise(
    (async () => {
      // Per-request opt-out: callers can set `useSession: false` to skip
      // the active smart-session and fall back to the SCA's default
      // validator (EOA-owner signature). Used for calls whose
      // (target, selector) is outside the session's action allowlist.
      const sessionAllowedByRequest =
        rhinestoneRequest.rhinestoneParams.useSession !== false
      const sessionSigners = sessionAllowedByRequest
        ? config.sessionConfig?.signers
        : undefined

      console.log('📤 Calling rhinestoneAccount transaction...', {
        chain: chain.name,
        chainId: chain.id,
        callCount: rhinestoneRequest.rhinestoneParams.calls.length,
        isSessionClient: !!config.isSessionClient,
        hasSessionSigners: !!sessionSigners,
        sessionAllowedByRequest,
      })

      const transaction = await account.sendTransaction({
        sourceChains: [chain],
        targetChain: chain,
        calls: rhinestoneRequest.rhinestoneParams.calls,
        sponsored: rhinestoneRequest.rhinestoneParams.sponsored ?? true,
        ...(sessionSigners ? { signers: sessionSigners } : {}),
      })
      const receipt = await account.waitForExecution(transaction, false)

      const txHash = receipt.fill.hash
      console.log('✅ Intent hash:', txHash)

      if (!txHash) {
        throw new Error('No transaction hash returned from Rhinestone SDK')
      }

      return txHash
    })(),
    (error) => {
      console.error(
        '❌ [RHINESTONE TRANSPORT] Transaction submission failed:',
        error,
      )
      console.error('❌ [RHINESTONE TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
        stack: (error as Error)?.stack,
      })
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    },
  )
}
