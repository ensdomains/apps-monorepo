/**
 * Smart-session gate for registration.
 *
 * On the HCA path, registration runs prompt-free via a smart session. When the
 * user confirms payment without an active session, we open the
 * EnableSessionModal for the single ENABLE signature, then proceed with the
 * registration that was pending. The EOA path (VITE_FF_USE_EOA) has no session,
 * so `needsSession` is false and confirm proceeds immediately.
 */

import type { registrationMachine, Signer } from '@ens-apps/transaction-manager'
import { useCallback, useRef, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import { needsSessionBeforeRegistration } from '@/lib/smart-account/sessionGate'
import { publicClient } from '@/lib/wagmi'
import { handleStartRegistration } from './RegistrationPage.handlers'

interface UseSessionGateParams {
  readonly account: SmartAccountContextValue
  readonly actor: ActorRefFrom<typeof registrationMachine>
  readonly name: string
  readonly duration: number
}

export interface SessionGate {
  /** Whether the EnableSessionModal is open. */
  isSessionModalOpen: boolean
  setSessionModalOpen: (open: boolean) => void
  /** Call when the user confirms payment; gates on session then registers. */
  confirmPayment: (tokenPrice: bigint, selectedToken: Address) => void
  /** Wired to the modal's onEnableSession; enables then resumes registration. */
  enableSessionAndResume: () => Promise<void>
}

export function useSessionGate({
  account,
  actor,
  name,
  duration,
}: UseSessionGateParams): SessionGate {
  const [isSessionModalOpen, setSessionModalOpen] = useState(false)
  const pendingRef = useRef<{
    tokenPrice: bigint
    selectedToken: Address
  } | null>(null)

  const proceed = useCallback(
    (tokenPrice: bigint, selectedToken: Address, signerOverride?: Signer) => {
      handleStartRegistration(
        { name, duration, selectedToken, tokenPrice },
        account,
        actor,
        { publicClient: publicClient as PublicClient, signerOverride },
      )
    },
    [name, duration, account, actor],
  )

  const needsSession = needsSessionBeforeRegistration(account)

  const confirmPayment = useCallback(
    (tokenPrice: bigint, selectedToken: Address) => {
      if (needsSession) {
        pendingRef.current = { tokenPrice, selectedToken }
        setSessionModalOpen(true)
        return
      }
      proceed(tokenPrice, selectedToken)
    },
    [needsSession, proceed],
  )

  const enableSessionAndResume = useCallback(async () => {
    const sessionSigner = await account.enableSession()
    if (!sessionSigner) return // modal stays open, surfaces account.sessionError
    setSessionModalOpen(false)
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) {
      // Pass the freshly session-attached signer directly — don't rely on
      // `account.signer` having re-rendered with the session yet.
      proceed(pending.tokenPrice, pending.selectedToken, sessionSigner)
    }
  }, [account, proceed])

  return {
    isSessionModalOpen,
    setSessionModalOpen,
    confirmPayment,
    enableSessionAndResume,
  }
}
