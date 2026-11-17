import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { WalletClient } from 'viem'
import { signInBackendMutation } from '@/features/notifications/data/queries/auth'
import { useWalletDisconnect } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'

type UseBackendSignInParams = {
  /** Whether a sign-in surface (standalone or the connect dialog's step) shows. */
  readonly isShown: boolean
  readonly walletClient: WalletClient | null | undefined
}

// Sign-in state shared by both sign-in surfaces, held by the one component that owns them so it survives switching between them.
export const useBackendSignIn = ({
  isShown,
  walletClient,
}: UseBackendSignInParams) => {
  const signIn = useMutation(signInBackendMutation)
  const [isConfirmingSkip, setIsConfirmingSkip] = useState(false)
  const { disconnect, isDisconnecting } = useWalletDisconnect()

  // The owner stays mounted while closed (SKIP hotkey, disconnect, dismiss),
  // so reset here to reopen at sign-in rather than the skip confirmation
  if (!isShown && isConfirmingSkip) {
    setIsConfirmingSkip(false)
  }

  const handleSignIn = async () => {
    if (!walletClient) {
      throw new Error('No wallet client found')
    }

    try {
      await signIn.mutateAsync({ walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }

  const skipSignIn = () => {
    backendAuthStore.trigger.dismissModal()
  }

  useHotkeySequence(['S', 'K', 'I', 'P'], skipSignIn, {
    enabled: isShown && !signIn.isPending,
    ignoreInputs: true,
    preventDefault: false,
    stopPropagation: false,
    timeout: 1000,
  })

  return {
    signIn,
    walletClient,
    isConfirmingSkip,
    setIsConfirmingSkip,
    handleSignIn,
    skipSignIn,
    disconnect,
    isDisconnecting,
  }
}

export type BackendSignIn = ReturnType<typeof useBackendSignIn>
