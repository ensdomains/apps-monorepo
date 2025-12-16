/**
 * Session Manager
 *
 * Core session management for ZeroDev smart sessions.
 * Creates sessions with sudo policy and handles serialization/deserialization.
 */

import {
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from '@zerodev/permissions'
import { toSudoPolicy } from '@zerodev/permissions/policies'
import { toECDSASigner } from '@zerodev/permissions/signers'
import {
  createKernelAccount,
  createKernelAccountClient,
  type KernelAccountClient,
  type KernelValidator,
} from '@zerodev/sdk'
import { KERNEL_V3_1 } from '@zerodev/sdk/constants'
import { errAsync, ResultAsync } from 'neverthrow'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { type Address, http } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { customSepolia, publicClient } from '@/lib/wagmi'
import {
  getValidSessionByOwner,
  removeSession,
  saveSession,
} from './session-storage'
import type { SessionConfig, StoredSession } from './types'

const ENTRY_POINT = {
  address: entryPoint07Address,
  version: '0.7' as const,
}

/**
 * Error types for session operations
 */
export class SessionError extends Error {
  constructor(
    public readonly reason: string,
    public readonly details?: string,
  ) {
    super(`${reason}${details ? `: ${details}` : ''}`)
    this.name = 'SessionError'
  }
}

/**
 * Create a new session for a smart account
 *
 * Generates a new session key pair, creates a permission validator with sudo policy,
 * and serializes the session for storage.
 *
 * @param params - Session creation parameters
 * @returns ResultAsync with stored session or error
 */
export function createSession(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
  config?: SessionConfig
}): ResultAsync<StoredSession, SessionError> {
  const { ownerAddress, smartAccountAddress, ecdsaValidator, config } = params

  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    return errAsync(new SessionError('Missing API key', 'VITE_PIMLICO_API_KEY'))
  }

  return ResultAsync.fromPromise(
    (async () => {
      // Generate a new session private key
      const sessionPrivateKey = generatePrivateKey()
      const sessionAccount = privateKeyToAccount(sessionPrivateKey)

      console.log('🔑 Creating session with key:', sessionAccount.address)

      // Create ECDSA signer from the session key
      const sessionSigner = await toECDSASigner({
        signer: sessionAccount,
      })

      console.log('🔧 Creating permission validator...')
      // Create permission validator with sudo policy (unrestricted)
      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: sessionSigner,
        policies: [toSudoPolicy({})],
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
      })
      console.log('✅ Permission validator created')

      console.log('🔧 Creating kernel account with session plugins...')
      // Create kernel account with permission validator as regular and ECDSA as sudo
      // The sudo validator is used to sign enabling the permission validator
      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: smartAccountAddress, // Use existing smart account address
      })
      console.log('✅ Kernel account with session plugins created')

      console.log(
        '🔧 Serializing permission account (may prompt wallet signature)...',
      )
      // Serialize the permission account for storage
      const serializedSessionAccount = await serializePermissionAccount(
        kernelAccount,
        sessionPrivateKey,
      )
      console.log('✅ Permission account serialized')

      // Create stored session
      const session: StoredSession = {
        id: crypto.randomUUID(),
        sessionKeyAddress: sessionAccount.address,
        smartAccountAddress,
        ownerAddress,
        createdAt: Date.now(),
        chainId: customSepolia.id,
        validUntil: config?.validUntil,
        serializedSessionAccount,
        sessionPrivateKey,
      }

      // Save to localStorage
      saveSession(session)

      console.log('✅ Session created:', session.id)

      return session
    })(),
    (error) =>
      new SessionError(
        'Failed to create session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}

/**
 * Get a KernelAccountClient from a stored session
 *
 * Deserializes the session and creates an account client ready for transactions.
 *
 * @param session - The stored session to restore
 * @returns ResultAsync with KernelAccountClient or error
 */
export function getSessionClient(
  session: StoredSession,
): ResultAsync<KernelAccountClient, SessionError> {
  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    return errAsync(new SessionError('Missing API key', 'VITE_PIMLICO_API_KEY'))
  }

  const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${pimlicoApiKey}`

  return ResultAsync.fromPromise(
    (async () => {
      // Recreate session signer from stored private key
      const sessionAccount = privateKeyToAccount(session.sessionPrivateKey)
      const sessionSigner = await toECDSASigner({
        signer: sessionAccount,
      })

      // Deserialize the permission account
      const kernelAccount = await deserializePermissionAccount(
        publicClient,
        ENTRY_POINT,
        KERNEL_V3_1,
        session.serializedSessionAccount,
        sessionSigner,
      )

      // Create Pimlico client for gas estimation and paymaster
      const pimlicoClient = createPimlicoClient({
        transport: http(PIMLICO_URL),
        entryPoint: ENTRY_POINT,
      })

      // Create account client with Pimlico bundler
      const client = createKernelAccountClient({
        account: kernelAccount,
        chain: customSepolia,
        bundlerTransport: http(PIMLICO_URL),
        // Use Pimlico client for gas estimation (avoids zd_getUserOperationGasPrice error)
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast
          },
        },
        paymaster: pimlicoClient,
      })

      console.log(
        '✅ Session client restored for:',
        session.smartAccountAddress,
      )

      return client as KernelAccountClient
    })(),
    (error) =>
      new SessionError(
        'Failed to restore session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}

/**
 * Get or create a session for an owner
 *
 * Checks localStorage for existing valid session, creates new one if needed.
 * This is the main entry point for session management.
 *
 * @param params - Owner and smart account addresses, plus ECDSA validator for new sessions
 * @returns ResultAsync with session client and session data
 */
export function getOrCreateSession(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
}): ResultAsync<
  { client: KernelAccountClient; session: StoredSession },
  SessionError
> {
  const { ownerAddress, smartAccountAddress, ecdsaValidator } = params

  // Check for existing valid session
  const existingSession = getValidSessionByOwner(ownerAddress)

  if (existingSession) {
    // Verify it's for the same smart account
    if (
      existingSession.smartAccountAddress.toLowerCase() ===
      smartAccountAddress.toLowerCase()
    ) {
      console.log('📦 Found existing session:', existingSession.id)
      return getSessionClient(existingSession).map((client) => ({
        client,
        session: existingSession,
      }))
    }
    // Different smart account, remove old session
    removeSession(existingSession.smartAccountAddress)
  }

  // Create new session
  return createSession({
    ownerAddress,
    smartAccountAddress,
    ecdsaValidator,
  }).andThen((session) =>
    getSessionClient(session).map((client) => ({
      client,
      session,
    })),
  )
}

/**
 * Revoke a session by removing it from storage
 *
 * Note: This only removes local storage. The session key on-chain
 * would need a separate revocation transaction if supported.
 */
export function revokeSession(accountAddress: Address): void {
  removeSession(accountAddress)
  console.log('🔒 Session revoked for:', accountAddress)
}
