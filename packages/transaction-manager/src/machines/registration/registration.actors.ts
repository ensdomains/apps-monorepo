/**
 * Registration Actor Functions
 *
 * Pure functions for ENS registration operations.
 */

import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type { Address, Hash, PublicClient } from 'viem'
import { encodeFunctionData, keccak256, toHex } from 'viem'
import { sepolia } from 'viem/chains'
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
function generateCommitment(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
  duration: bigint,
  registrarAddress: Address = ENS_SEPOLIA_CONTRACTS.ETHRegistrar,
): ResultAsync<CommitmentData, Error> {
  const cleanName = name.replace('.eth', '')
  const secret = keccak256(toHex(Math.random().toString()) as Hash)

  return fromPromise(
    (async () => {
      const commitment = await publicClient.readContract({
        address: registrarAddress,
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
      })
      return { commitment: commitment as Hash, secret }
    })(),
    (error) => {
      console.error('❌ Failed to generate commitment:', error)
      return new Error(`Failed to generate commitment: ${error}`)
    },
  )
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
function encodeTokenApprovalData(
  amount: bigint,
  registrarAddress: Address,
): Hash {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [registrarAddress, amount * 2n],
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

function selectRegistrarAddress(useFastRegistrar: boolean): Address {
  return useFastRegistrar
    ? ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar
    : ENS_SEPOLIA_CONTRACTS.ETHRegistrar
}

function getSmartAccountAddress(signer: import('../..').Signer): Address {
  if (signer.type === 'rhinestone') {
    return signer.account.getAddress() as Address
  }
  throw new Error('Only Rhinestone signer is supported for registration')
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
  useFastRegistrar: boolean
}): ResultAsync<CommitmentData, Error> {
  const registrarAddress = selectRegistrarAddress(input.useFastRegistrar)

  return generateCommitment(
    input.publicClient,
    input.name,
    input.owner,
    input.duration,
    registrarAddress,
  )
}

/**
 * Submit commitment transaction via transaction manager
 * Note: Includes ETH balance check (smart account needs ETH for gas)
 */
export function submitCommitmentActor(input: {
  commitment: CommitmentData
  signer: import('../..').Signer
  name: string
  duration: bigint
  publicClient: PublicClient
  useFastRegistrar: boolean
}): ResultAsync<string, Error> {
  const registrarAddress = selectRegistrarAddress(input.useFastRegistrar)

  return fromPromise(
    (async () => {
      console.log(
        `🔧 [REGISTRATION ACTOR] submitCommitmentActor called with:`,
        {
          hasPublicClient: !!input.publicClient,
          hasSigner: !!input.signer,
          signerType: input.signer?.type,
          name: input.name,
        },
      )

      const smartAccountAddress = getSmartAccountAddress(input.signer)

      // Check smart account ETH balance before committing
      const ethBalance = await input.publicClient.getBalance({
        address: smartAccountAddress,
      })

      console.log(`💰 [REGISTRATION ACTOR] Smart account ETH balance:`, {
        address: smartAccountAddress,
        balance: ethBalance.toString(),
        balanceInEth: (Number(ethBalance) / 1e18).toFixed(6),
      })

      if (ethBalance === 0n) {
        throw new Error(
          `Smart account needs ETH for gas. Send Sepolia ETH to: ${smartAccountAddress}`,
        )
      }

      // Warn if balance is very low (less than 0.001 ETH)
      if (ethBalance < 1000000000000000n) {
        console.warn(`⚠️ [REGISTRATION ACTOR] Low ETH balance - may fail:`, {
          balance: (Number(ethBalance) / 1e18).toFixed(6),
          recommended: '0.001 ETH or more',
        })
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
            to: registrarAddress,
            data: commitmentData,
            value: 0n,
            chainId: sepolia.id, // Sepolia
            rhinestoneParams: {
              calls: [
                {
                  to: registrarAddress,
                  data: commitmentData,
                  value: 0n,
                },
              ],
            },
          },
        },
        input.signer,
        {
          description: `Commit to register ${input.name}.eth`,
          publicClient: input.publicClient,
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
  signer: import('../..').Signer
  publicClient: PublicClient
  useFastRegistrar: boolean
}): ResultAsync<string, Error> {
  const registrarAddress = selectRegistrarAddress(input.useFastRegistrar)

  return ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const smartAccountAddress = getSmartAccountAddress(input.signer)

      const tokenAddress = getPaymentTokenAddress(input.selectedToken)
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedTokenAddress = tokenAddress.toLowerCase() as Address
      console.log(
        `🔧 Token address normalization: ${tokenAddress} -> ${normalizedTokenAddress}`,
      )

      const approvalData = encodeTokenApprovalData(
        input.tokenPrice,
        registrarAddress,
      )

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
            to: normalizedTokenAddress,
            data: approvalData,
            value: 0n,
            chainId: sepolia.id, // Sepolia
            rhinestoneParams: {
              calls: [
                {
                  to: normalizedTokenAddress,
                  data: approvalData,
                  value: 0n,
                },
              ],
            },
          },
        },
        input.signer,
        {
          description: `Approve ${input.selectedToken} for registration`,
          publicClient: input.publicClient,
        },
      )

      return txId
    }),
  ).mapErr((error) => new Error(`Failed to submit approval: ${error}`))
}

/**
 * Submit registration transaction via transaction manager
 * Note: Normalizes payment token address to lowercase for Rhinestone SDK compatibility
 */
export function submitRegistrationActor(input: {
  name: string
  commitment: CommitmentData
  signer: import('../..').Signer
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  owner: Address
  publicClient: PublicClient
  useFastRegistrar: boolean
}): ResultAsync<string, Error> {
  const registrarAddress = selectRegistrarAddress(input.useFastRegistrar)

  return fromPromise(
    (async () => {
      const smartAccountAddress = getSmartAccountAddress(input.signer)

      const paymentToken = getPaymentTokenAddress(input.selectedToken)
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address
      console.log(
        `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
      )

      // Check if the payment token is supported
      const isSupported = await input.publicClient.readContract({
        address: registrarAddress,
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
            from: smartAccountAddress,
            to: registrarAddress,
            data: registrationData,
            value: 0n,
            chainId: sepolia.id, // Sepolia
            rhinestoneParams: {
              calls: [
                {
                  to: registrarAddress,
                  data: registrationData,
                  value: 0n,
                },
              ],
            },
          },
        },
        input.signer,
        {
          description: `Register ${input.name}.eth`,
          publicClient: input.publicClient,
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

  return fromPromise(
    new Promise<void>((resolve, reject) => {
      const subscription = txActor.subscribe((snapshot) => {
        console.log('🔍 [POLL TX STATUS] Transaction state:', {
          txId: input.txId,
          state: snapshot.value,
          hasError: !!snapshot.context.error,
          error: snapshot.context.error?.message,
        })

        if (snapshot.matches('success')) {
          console.log('✅ [POLL TX STATUS] Transaction succeeded')
          subscription.unsubscribe()
          resolve()
        }
        // Check if we're in any error state (handles nested states like error.submission, error.reverted, etc.)
        if (typeof snapshot.value === 'object' && 'error' in snapshot.value) {
          console.error('❌ [POLL TX STATUS] Transaction failed:', {
            errorState: snapshot.value,
            error: snapshot.context.error,
          })
          subscription.unsubscribe()
          reject(snapshot.context.error || new Error('Transaction failed'))
        }
      })
    }),
    (error) => error as Error,
  )
}
