/**
 * Registration Actor Functions
 *
 * Pure functions for ENS registration operations.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { err, errAsync, ok, type Result, ResultAsync } from 'neverthrow'
import type { Address, Hash, PublicClient } from 'viem'
import { encodeFunctionData, keccak256, toHex } from 'viem'
import {
  ENS_SEPOLIA_CONTRACTS,
  ERC20_ABI,
  FAST_TEST_ETH_REGISTRAR_ABI,
  REFERER_ADDRESS,
  SUPPORTED_TOKENS,
} from '../../contracts/ens-sepolia'
import { transactionManager } from '../../providers/transactionManager'

type CommitmentData = {
  commitment: Hash
  secret: Hash
}

// ============================================================================
// Helper Functions (only used in this file)
// ============================================================================

/**
 * Generate commitment hash via contract call
 * Note: Uses makeCommitment (NOT makeCommitmentWithToken)
 * Payment token is specified during registration, not commitment
 */
async function generateCommitment(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
  duration: bigint,
  _paymentToken: Address = SUPPORTED_TOKENS.USDC, // Not used in commitment
): Promise<Result<CommitmentData, Error>> {
  try {
    const cleanName = name.replace('.eth', '')
    const secret = keccak256(toHex(Math.random().toString()) as Hash)

    const commitment = (await publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FAST_TEST_ETH_REGISTRAR_ABI,
      functionName: 'makeCommitment',
      args: [
        cleanName,
        ownerAddress,
        secret,
        ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl,
        duration,
        REFERER_ADDRESS,
      ],
    })) as Hash

    return ok({ commitment, secret })
  } catch (error) {
    console.error('❌ Failed to generate commitment:', error)
    return err(new Error(`Failed to generate commitment: ${error}`))
  }
}

/**
 * Encode commitment transaction data
 */
function encodeCommitmentData(commitment: Hash): Hash {
  return encodeFunctionData({
    abi: FAST_TEST_ETH_REGISTRAR_ABI,
    functionName: 'commit',
    args: [commitment],
  })
}

/**
 * Encode token approval transaction data
 */
function encodeTokenApprovalData(amount: bigint): Hash {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, amount * 2n],
  })
}

/**
 * Encode registration transaction data
 */
function encodeRegistrationData(
  name: string,
  ownerAddress: Address,
  secret: Hash,
  duration: bigint,
  paymentToken: Address,
): Hash {
  const cleanName = name.replace('.eth', '')

  return encodeFunctionData({
    abi: FAST_TEST_ETH_REGISTRAR_ABI,
    functionName: 'register',
    args: [
      cleanName,
      ownerAddress,
      secret,
      ENS_SEPOLIA_CONTRACTS.ETHRegistry,
      ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl,
      duration,
      paymentToken,
      REFERER_ADDRESS,
    ],
  })
}

/**
 * Get payment token address
 */
function getPaymentTokenAddress(token: 'USDC' | 'DAI'): Address {
  return SUPPORTED_TOKENS[token]
}

// ============================================================================
// Actor Functions (exported for use with fromResultAsync in machine)
// ============================================================================

/**
 * Generate commitment for ENS registration
 */
export function generateCommitmentActor(input: {
  name: string
  owner: Address
  duration: bigint
  publicClient: PublicClient
  selectedToken: 'USDC' | 'DAI'
}): ResultAsync<CommitmentData, Error> {
  const paymentToken = getPaymentTokenAddress(input.selectedToken)

  return ResultAsync.fromPromise(
    generateCommitment(
      input.publicClient,
      input.name,
      input.owner,
      input.duration,
      paymentToken,
    ).then((result) => {
      if (result.isErr()) throw result.error
      return result.value
    }),
    (error) => error as Error,
  )
}

/**
 * Submit commitment transaction via transaction manager
 * Note: Includes ETH balance check (smart account needs ETH for gas)
 */
export function submitCommitmentActor(input: {
  commitment: CommitmentData
  rhinestoneAccount: RhinestoneAccount
  name: string
  duration: bigint
  publicClient: PublicClient
}): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    (async () => {
      console.log(
        `🔧 [REGISTRATION ACTOR] submitCommitmentActor called with:`,
        {
          hasPublicClient: !!input.publicClient,
          hasRhinestoneAccount: !!input.rhinestoneAccount,
          name: input.name,
        },
      )

      // Check smart account ETH balance before committing
      const smartAccountAddress =
        input.rhinestoneAccount.getAddress() as Address
      const ethBalance = await input.publicClient.getBalance({
        address: smartAccountAddress,
      })

      if (ethBalance === 0n) {
        throw new Error(
          `Smart account needs ETH for gas. Send Sepolia ETH to: ${smartAccountAddress}`,
        )
      }

      const commitmentData = encodeCommitmentData(input.commitment.commitment)

      console.log(
        `🔧 [REGISTRATION ACTOR] About to call startTransaction with publicClient:`,
        !!input.publicClient,
      )

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
            to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
            data: commitmentData,
            value: 0n,
            chainId: 11155111, // Sepolia
          },
        },
        {
          type: 'rhinestone',
          account: input.rhinestoneAccount,
        },
        {
          description: `Commit to register ${input.name}.eth`,
          publicClient: input.publicClient, // Pass publicClient directly
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Submit token approval transaction via transaction manager
 * Note: Normalizes token address to lowercase for Rhinestone SDK compatibility
 */
export function submitApprovalActor(input: {
  tokenPrice: bigint
  selectedToken: 'USDC' | 'DAI'
  rhinestoneAccount: RhinestoneAccount
  publicClient: PublicClient
}): ResultAsync<string, Error> {
  try {
    const tokenAddress = getPaymentTokenAddress(input.selectedToken)
    // Normalize to lowercase to avoid Rhinestone SDK validation issues
    const normalizedTokenAddress = tokenAddress.toLowerCase() as Address
    console.log(
      `🔧 Token address normalization: ${tokenAddress} -> ${normalizedTokenAddress}`,
    )

    const approvalData = encodeTokenApprovalData(input.tokenPrice)

    const txId = transactionManager.startTransaction(
      {
        type: 'custom',
        request: {
          type: 'rhinestone-intent',
          from: input.rhinestoneAccount.getAddress(),
          to: normalizedTokenAddress,
          data: approvalData,
          value: 0n,
          chainId: 11155111, // Sepolia
        },
      },
      {
        type: 'rhinestone',
        account: input.rhinestoneAccount,
      },
      {
        description: `Approve ${input.selectedToken} for registration`,
        publicClient: input.publicClient, // Pass publicClient directly
      },
    )

    return ResultAsync.fromSafePromise(Promise.resolve(txId))
  } catch (error) {
    return errAsync(new Error(`Failed to submit approval: ${error}`))
  }
}

/**
 * Submit registration transaction via transaction manager
 * Note: Normalizes payment token address to lowercase for Rhinestone SDK compatibility
 */
export function submitRegistrationActor(input: {
  name: string
  commitment: CommitmentData
  rhinestoneAccount: RhinestoneAccount
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  owner: Address
  publicClient: PublicClient
}): ResultAsync<string, Error> {
  return ResultAsync.fromPromise(
    (async () => {
      const paymentToken = getPaymentTokenAddress(input.selectedToken)
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address
      console.log(
        `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
      )

      // Check if the payment token is supported
      const isSupported = await input.publicClient.readContract({
        address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        abi: FAST_TEST_ETH_REGISTRAR_ABI,
        functionName: 'isPaymentToken',
        args: [normalizedPaymentToken],
      })

      console.log(
        `🔍 Payment token ${normalizedPaymentToken} is supported:`,
        isSupported,
      )

      if (!isSupported) {
        throw new Error(
          `Payment token ${normalizedPaymentToken} is not supported by the ENS registrar`,
        )
      }

      const registrationData = encodeRegistrationData(
        input.name,
        input.owner,
        input.commitment.secret,
        input.duration,
        normalizedPaymentToken,
      )

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: input.rhinestoneAccount.getAddress(),
            to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
            data: registrationData,
            value: 0n,
            chainId: 11155111, // Sepolia
          },
        },
        {
          type: 'rhinestone',
          account: input.rhinestoneAccount,
        },
        {
          description: `Register ${input.name}.eth`,
          publicClient: input.publicClient, // Pass publicClient directly
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Poll transaction status by subscribing to transaction machine
 */
export function pollTransactionStatusActor(input: {
  txId: string
}): ResultAsync<void, Error> {
  const txActor = transactionManager.getTransaction(input.txId)

  if (!txActor) {
    return errAsync(new Error(`Transaction ${input.txId} not found`))
  }

  return ResultAsync.fromPromise(
    new Promise<void>((resolve, reject) => {
      const subscription = txActor.subscribe((snapshot) => {
        if (snapshot.matches('success')) {
          subscription.unsubscribe()
          resolve()
        }
        if (snapshot.matches({ error: {} })) {
          subscription.unsubscribe()
          reject(snapshot.context.error || new Error('Transaction failed'))
        }
      })
    }),
    (error) => error as Error,
  )
}
