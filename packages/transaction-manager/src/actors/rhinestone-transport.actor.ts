import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Account, Hash, PublicClient } from 'viem'
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
  eoaAccountSigner: Account
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer, eoaAccountSigner: eoaAccountSignerFromInput } = input
  const {
    account,
    config,
    eoaAccountSigner: eoaAccountSignerFromSigner,
  } = signer
  // Prefer eoaAccountSigner from signer config, fallback to input parameter
  const eoaAccountSigner =
    eoaAccountSignerFromSigner ?? eoaAccountSignerFromInput
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
      console.log('📤 Calling rhinestoneAccount.sendTransaction()...', {
        chain: chain.name,
        chainId: chain.id,
        callCount: rhinestoneRequest.rhinestoneParams.calls.length,
        calls: rhinestoneRequest.rhinestoneParams.calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: call.value.toString(),
        })),
        hasEoaAccountSigner: !!eoaAccountSigner,
        eoaAccountSignerAddress: eoaAccountSigner?.address,
      })

      // Pass signers with the EOA account signer
      if (!eoaAccountSigner) {
        throw new Error(
          'eoaAccountSigner is required for Rhinestone transactions with multi-owner accounts',
        )
      }

      const transaction = await account.sendTransaction({
        chain: chain,
        calls: rhinestoneRequest.rhinestoneParams.calls,
        sponsored: rhinestoneRequest.rhinestoneParams.sponsored ?? true,
        signers: {
          type: 'owner',
          kind: 'ecdsa',
          accounts: [eoaAccountSigner],
        },
      })
      const receipt = await account.waitForExecution(transaction, false)

      console.log('✅ Transaction response:', receipt)

      // Rhinestone returns an "intent" object with an 'id' property, not 'hash'
      const txHash = receipt.fill.hash

      console.log('✅ Transaction hash/id:', txHash)
      console.log('✅ Transaction type:', transaction.type)

      if (!transaction || !txHash) {
        console.error('❌ No transaction hash or ID returned!', transaction)
        throw new Error(
          'No transaction hash or ID returned from Rhinestone SDK',
        )
      }

      console.log('✅ Final hash:', txHash)
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
