'use client'

import type { KernelAccountState } from '@/lib/smart-account'
import { isKernelAccount, useSmartAccount } from '@/lib/smart-account'
import { useSessionManager } from '@/lib/smart-account/sessions/useSessionManager'
import { EnableSessionModal } from './EnableSessionModal'

/**
 * Smart Session Provider
 *
 * Manages smart session creation for kernel accounts.
 * Shows the EnableSessionModal after wallet connects if no session exists.
 *
 * Place this component high in the tree, inside wallet providers.
 */
export function SmartSessionProvider() {
  const smartAccount = useSmartAccount({ type: 'kernel' })

  // Only manage sessions for kernel accounts
  if (!isKernelAccount(smartAccount)) {
    return null
  }

  // Type narrowing confirms this is a KernelAccountState
  const kernelAccount = smartAccount as KernelAccountState

  return (
    <SmartSessionManager
      ownerAddress={kernelAccount.ownerAddress}
      smartAccountAddress={kernelAccount.accountAddress}
      ecdsaValidator={kernelAccount.ecdsaValidator}
      isAccountReady={kernelAccount.isAccountReady}
      onSessionCreated={kernelAccount.setSessionData}
    />
  )
}

/**
 * Internal component that manages the session modal
 * Separated to ensure hooks are called unconditionally
 */
function SmartSessionManager({
  ownerAddress,
  smartAccountAddress,
  ecdsaValidator,
  isAccountReady,
  onSessionCreated,
}: {
  ownerAddress: string | null
  smartAccountAddress: string | null
  ecdsaValidator: Parameters<typeof useSessionManager>[0]['ecdsaValidator']
  isAccountReady: boolean
  onSessionCreated: Parameters<typeof useSessionManager>[0]['onSessionCreated']
}) {
  const { showEnableModal, setShowEnableModal, enableSession, dismissModal } =
    useSessionManager({
      ownerAddress: ownerAddress as `0x${string}` | null,
      smartAccountAddress: smartAccountAddress as `0x${string}` | null,
      ecdsaValidator,
      isAccountReady,
      onSessionCreated,
    })

  const handleEnableSession = async () => {
    await enableSession()
    setShowEnableModal(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      dismissModal()
    }
    setShowEnableModal(open)
  }

  return (
    <EnableSessionModal
      open={showEnableModal}
      onOpenChange={handleOpenChange}
      onEnableSession={handleEnableSession}
      walletAddress={ownerAddress ?? undefined}
      smartAccountAddress={smartAccountAddress ?? undefined}
    />
  )
}
