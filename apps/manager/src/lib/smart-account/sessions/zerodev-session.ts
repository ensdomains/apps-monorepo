/**
 * ZeroDev Session Manager
 *
 * Core session management for ZeroDev smart sessions.
 * Creates sessions with sudo policy and handles serialization/deserialization.
 *
 * This module exposes low-level pure functions that can be used from
 * React hooks and XState actors alike.
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
import { type Address, http, type PublicClient } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { customSepolia, publicClient } from '@/lib/wagmi'
import {
  getValidSessionByOwner,
  removeSession,
  saveSession,
} from './session-storage'
import type {
  SessionConfig,
  StoredSession,
  ZeroDevStoredSession,
} from './types'

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

export interface CreateZeroDevSessionParams {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
  kernelClient: KernelAccountClient
  chainId: number
  config?: SessionConfig
}

/**
 * Internal helper – create a new ZeroDev session and persist it.
 *
 * Generates a new session key pair, creates a permission validator with sudo
 * policy, and serializes the session for storage.
 */
function createSession(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
  config?: SessionConfig
}): ResultAsync<ZeroDevStoredSession, SessionError> {
  const { ownerAddress, smartAccountAddress, ecdsaValidator, config } = params

  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    return errAsync(new SessionError('Missing API key', 'VITE_PIMLICO_API_KEY'))
  }

  return ResultAsync.fromPromise(
    (async () => {
      const sessionPrivateKey = generatePrivateKey()
      const sessionAccount = privateKeyToAccount(sessionPrivateKey)

      const sessionSigner = await toECDSASigner({
        signer: sessionAccount,
      })

      const permissionValidator = await toPermissionValidator(publicClient, {
        signer: sessionSigner,
        policies: [toSudoPolicy({})],
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
      })

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint: ENTRY_POINT,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: ecdsaValidator,
          regular: permissionValidator,
        },
        address: smartAccountAddress,
      })

      const serializedSessionAccount = await serializePermissionAccount(
        kernelAccount,
        sessionPrivateKey,
      )

      const session: ZeroDevStoredSession = {
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

      saveSession(session)

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
 * Internal helper – get a KernelAccountClient from a stored ZeroDev session.
 */
function getSessionClient(
  session: ZeroDevStoredSession,
): ResultAsync<KernelAccountClient, SessionError> {
  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!pimlicoApiKey) {
    return errAsync(new SessionError('Missing API key', 'VITE_PIMLICO_API_KEY'))
  }

  const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${pimlicoApiKey}`

  return ResultAsync.fromPromise(
    (async () => {
      const sessionAccount = privateKeyToAccount(session.sessionPrivateKey)
      const sessionSigner = await toECDSASigner({
        signer: sessionAccount,
      })

      const kernelAccount = await deserializePermissionAccount(
        publicClient,
        ENTRY_POINT,
        KERNEL_V3_1,
        session.serializedSessionAccount,
        sessionSigner,
      )

      const pimlicoClient = createPimlicoClient({
        transport: http(PIMLICO_URL),
        entryPoint: ENTRY_POINT,
      })

      const client = createKernelAccountClient({
        account: kernelAccount,
        chain: customSepolia,
        bundlerTransport: http(PIMLICO_URL),
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast
          },
        },
        paymaster: pimlicoClient,
      })

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
 * Create a new ZeroDev session.
 *
 * Returns the stored session data and the corresponding session client.
 * The session is also persisted via the existing session-storage helpers.
 */
export function createZeroDevSession(
  params: CreateZeroDevSessionParams,
): ResultAsync<
  {
    session: ZeroDevStoredSession
    client: KernelAccountClient
  },
  SessionError
> {
  const { ownerAddress, smartAccountAddress, ecdsaValidator, config } = params

  return createSession({
    ownerAddress,
    smartAccountAddress,
    ecdsaValidator,
    config,
  }).andThen((session) =>
    getSessionClient(session).map((client) => ({
      session,
      client,
    })),
  )
}

export interface RestoreZeroDevSessionParams {
  session: ZeroDevStoredSession
  publicClient: PublicClient
  chainId: number
}

/**
 * Restore an existing ZeroDev session from stored data.
 *
 * The additional parameters are accepted for future flexibility but the
 * current implementation relies on the shared wagmi publicClient and
 * customSepolia chain configuration.
 */
export function restoreZeroDevSession(
  params: RestoreZeroDevSessionParams,
): ResultAsync<KernelAccountClient, SessionError> {
  return getSessionClient(params.session)
}

/**
 * Legacy helpers used by the existing React hook. These are left in place
 * for backwards compatibility and simply delegate to the ZeroDev helpers.
 */
export function createSessionLegacy(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
  config?: SessionConfig
}): ResultAsync<StoredSession, SessionError> {
  return createSession(params)
}

export function getSessionClientLegacy(
  session: StoredSession,
): ResultAsync<KernelAccountClient, SessionError> {
  return getSessionClient(session as ZeroDevStoredSession)
}

export function getOrCreateSession(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
}): ResultAsync<
  { client: KernelAccountClient; session: StoredSession },
  SessionError
> {
  const { ownerAddress, smartAccountAddress, ecdsaValidator } = params

  const existingSession = getValidSessionByOwner(ownerAddress)

  if (existingSession) {
    if (
      existingSession.smartAccountAddress.toLowerCase() ===
      smartAccountAddress.toLowerCase()
    ) {
      return getSessionClientLegacy(existingSession).map((client) => ({
        client,
        session: existingSession,
      }))
    }
    removeSession(existingSession.smartAccountAddress)
  }

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

export function revokeSession(accountAddress: Address): void {
  removeSession(accountAddress)
  console.log('🔒 Session revoked for:', accountAddress)
}
