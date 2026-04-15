'use client'

import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { createSession, getSessionClient } from './session-manager'
import { getValidSessionByOwner, removeSession } from './session-storage'
import type { StoredSession } from './types'

export interface UseSessionManagerParams {
  /** Owner EOA address */
  ownerAddress: Address | null
  /** Smart account address */
  smartAccountAddress: Address | null
  /** ECDSA validator for session creation */
  ecdsaValidator: KernelValidator<'ECDSAValidator'> | null
  /** Whether the kernel account is ready */
  isAccountReady: boolean
  /** Callback when session is created - receives session and sessionClient */
  onSessionCreated?: (
    session: StoredSession,
    sessionClient: KernelAccountClient,
  ) => void
}

export interface UseSessionManagerResult {
  /** Whether the enable session modal should be shown */
  showEnableModal: boolean
  /** Set the modal visibility */
  setShowEnableModal: (show: boolean) => void
  /** Current session if any */
  session: StoredSession | null
  /** Whether a session is active */
  hasActiveSession: boolean
  /** Enable session - call this when user clicks "Enable" in modal */
  enableSession: () => Promise<void>
  /** Session client if session is active */
  sessionClient: KernelAccountClient | null
  /** Whether session is being created */
  isCreatingSession: boolean
  /** Error message if session creation failed */
  sessionError: string | null
  /** Dismiss the modal without creating a session */
  dismissModal: () => void
  /** Whether user has dismissed the modal this session */
  hasSkippedSession: boolean
}

const SKIPPED_SESSION_KEY = 'ens-session-skipped'

/**
 * Hook to manage smart session lifecycle and modal visibility.
 * Shows the enable modal immediately after wallet connects if no session exists.
 */
export function useSessionManager(
  params: UseSessionManagerParams,
): UseSessionManagerResult {
  const {
    ownerAddress,
    smartAccountAddress,
    ecdsaValidator,
    isAccountReady,
    onSessionCreated,
  } = params

  const [showEnableModal, setShowEnableModal] = useState(false)
  const [session, setSession] = useState<StoredSession | null>(null)
  const [sessionClient, setSessionClient] =
    useState<KernelAccountClient | null>(null)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [hasSkippedSession, setHasSkippedSession] = useState(false)
  const [hasCheckedSession, setHasCheckedSession] = useState(false)

  // Check if user has previously skipped session creation
  useEffect(() => {
    if (typeof window !== 'undefined' && ownerAddress) {
      const wasSkipped = localStorage.getItem(
        `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
      )
      setHasSkippedSession(wasSkipped === 'true')
    }
  }, [ownerAddress])

  // Check for existing session when account becomes ready
  useEffect(() => {
    if (!isAccountReady || !ownerAddress || hasCheckedSession) return

    // Read from localStorage directly to avoid race condition with hasSkippedSession state
    const wasSkipped =
      typeof window !== 'undefined' &&
      localStorage.getItem(
        `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
      ) === 'true'

    const existingSession = getValidSessionByOwner(ownerAddress)

    if (existingSession) {
      console.log('📦 Found existing session:', existingSession.id)
      setSession(existingSession)

      // Restore session client
      getSessionClient(existingSession).then((result) => {
        if (result.isOk()) {
          setSessionClient(result.value)
          console.log('✅ Session client restored')
          // Notify parent that session is ready
          onSessionCreated?.(existingSession, result.value)
        } else {
          console.warn('Failed to restore session client:', result.error)
          // Session is corrupted, remove it and show modal
          removeSession(existingSession.smartAccountAddress)
          setSession(null)
          if (!wasSkipped) {
            setShowEnableModal(true)
          }
        }
      })
    } else if (!wasSkipped) {
      // No existing session, show modal immediately after wallet connects
      console.log('🔔 No session found, showing enable modal')
      setShowEnableModal(true)
    }

    setHasCheckedSession(true)
  }, [isAccountReady, ownerAddress, hasCheckedSession, onSessionCreated])

  // Reset state when wallet disconnects
  useEffect(() => {
    if (!ownerAddress) {
      setSession(null)
      setSessionClient(null)
      setShowEnableModal(false)
      setHasCheckedSession(false)
      setSessionError(null)
    }
  }, [ownerAddress])

  const enableSession = useCallback(async () => {
    if (!ownerAddress || !smartAccountAddress || !ecdsaValidator) {
      throw new Error('Account not ready for session creation')
    }

    setIsCreatingSession(true)
    setSessionError(null)

    try {
      console.log('🔑 Creating session...')

      const result = await createSession({
        ownerAddress,
        smartAccountAddress,
        ecdsaValidator,
        // No validUntil = never expires
      })

      if (result.isErr()) {
        throw new Error(result.error.message)
      }

      const newSession = result.value
      setSession(newSession)

      // Get session client
      const clientResult = await getSessionClient(newSession)
      if (clientResult.isErr()) {
        throw new Error(clientResult.error.message)
      }

      setSessionClient(clientResult.value)

      // Notify parent that session is ready
      onSessionCreated?.(newSession, clientResult.value)

      // Clear skipped flag if user successfully creates session
      if (typeof window !== 'undefined') {
        localStorage.removeItem(
          `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
        )
      }
      setHasSkippedSession(false)

      console.log('✅ Session enabled:', newSession.id)
    } catch (error) {
      console.error('Failed to create session:', error)
      setSessionError(
        error instanceof Error ? error.message : 'Failed to create session',
      )
      throw error
    } finally {
      setIsCreatingSession(false)
    }
  }, [ownerAddress, smartAccountAddress, ecdsaValidator, onSessionCreated])

  const dismissModal = useCallback(() => {
    setShowEnableModal(false)
    setHasSkippedSession(true)

    // Remember that user skipped
    if (typeof window !== 'undefined' && ownerAddress) {
      localStorage.setItem(
        `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
        'true',
      )
    }

    console.log('⏭️ User skipped session creation')
  }, [ownerAddress])

  return {
    showEnableModal,
    setShowEnableModal,
    session,
    hasActiveSession: !!session && !!sessionClient,
    enableSession,
    sessionClient,
    isCreatingSession,
    sessionError,
    dismissModal,
    hasSkippedSession,
  }
}
