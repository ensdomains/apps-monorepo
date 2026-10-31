import { Trans } from '@lingui/react/macro'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { signInBackendMutation } from '@/features/notifications/data/queries/auth'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { useWalletDisconnect } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'

export const BackendAuthModal = () => {
  const isNotAuthedOrDismissed = useSelector(
    backendAuthStore,
    (state) => !state.context.authKey && state.context.modalDismissed === false,
  )
  const signIn = useMutation(signInBackendMutation)
  const [isConfirmingSkip, setIsConfirmingSkip] = useState(false)

  const { isConnected: isWalletConnected } = useConnection()
  const { disconnect, isDisconnecting } = useWalletDisconnect()

  // Hold this modal until the SCA is live. Hook is null before the
  // provider mounts; then we don't wait, so EOA-only isn't stuck.
  const smartAccount = useSmartAccountContextSafe()
  const walletClient = smartAccount?.walletClient
  const isSmartAccountReady =
    smartAccount === null || smartAccount.isAccountReady || !!smartAccount.error
  const shouldShowModal =
    isWalletConnected && isNotAuthedOrDismissed && isSmartAccountReady

  // The modal stays mounted while closed (SKIP hotkey, disconnect, dismiss),
  // so reset here to reopen at sign-in rather than the skip confirmation
  if (!shouldShowModal && isConfirmingSkip) {
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

  useHotkeySequence(
    ['S', 'K', 'I', 'P'],
    () => {
      backendAuthStore.trigger.dismissModal()
    },
    {
      enabled: shouldShowModal && !signIn.isPending,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      timeout: 1000,
    },
  )

  return (
    <AlertDialog.Root open={shouldShowModal}>
      <AlertDialog.Content
        className="gap-6 border-ens-gray-two p-6 sm:max-w-sm sm:p-8"
        onEscapeKeyDown={(event) => {
          event.preventDefault()
        }}
      >
        {isConfirmingSkip ? (
          <>
            <AlertDialog.Header className="items-center gap-0 text-center sm:text-center">
              <AlertDialog.Title className="font-medium text-ens-blue-midnight text-xl tracking-tight">
                <Trans>Continue without signing in?</Trans>
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-4 self-stretch text-pretty text-left text-ens-gray text-xs leading-normal">
                <Trans>
                  Signing in is the recommended way to use the ENS App. It
                  enables notifications for transfers and expirations, and saved
                  items like favorites and searches.
                </Trans>
              </AlertDialog.Description>
            </AlertDialog.Header>
            <p className="-mt-3 text-pretty text-ens-gray text-xs leading-normal">
              <Trans>You can sign in anytime from your wallet menu.</Trans>
            </p>

            <AlertDialog.Footer className="flex-row sm:justify-stretch">
              <Button
                className="min-w-0 flex-1 uppercase tracking-wider"
                onClick={() => backendAuthStore.trigger.dismissModal()}
                size="lg"
                type="button"
                variant="outline"
              >
                <Trans>Continue</Trans>
              </Button>
              <Button
                className="min-w-0 flex-1 bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
                disabled={!walletClient}
                onClick={() => {
                  setIsConfirmingSkip(false)
                  void handleSignIn()
                }}
                size="lg"
                type="button"
              >
                <Trans>Sign in</Trans>
              </Button>
            </AlertDialog.Footer>
          </>
        ) : (
          <>
            <AlertDialog.Header className="items-center gap-0 text-center sm:text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-md bg-ens-blue text-white shadow-ens-blue/30 shadow-lg">
                <EnsMobileIcon className="h-8 w-7" />
              </div>
              <AlertDialog.Title className="font-medium text-ens-blue-midnight text-xl tracking-tight">
                <Trans>Authenticate to continue</Trans>
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-pretty text-ens-gray text-sm leading-normal">
                <Trans>Please sign in with your connected wallet.</Trans>
              </AlertDialog.Description>
            </AlertDialog.Header>

            {signIn.isError && (
              <p className="-mt-2 text-center text-destructive text-sm">
                <Trans>Signing didn't go through. Please try again.</Trans>
              </p>
            )}
            {!walletClient && !isDisconnecting && (
              <p className="-mt-2 text-center text-destructive text-sm">
                <Trans>
                  Wallet client missing, please reconnect your wallet and try
                  again.
                </Trans>
              </p>
            )}

            <AlertDialog.Footer className="flex-row sm:justify-stretch">
              <Button
                className="min-w-0 flex-1 uppercase tracking-wider"
                disabled={signIn.isPending || isDisconnecting}
                onClick={() => void disconnect()}
                size="lg"
                type="button"
                variant="outline"
              >
                {isDisconnecting ? (
                  <Trans>Disconnecting...</Trans>
                ) : (
                  <Trans>Disconnect</Trans>
                )}
              </Button>
              <Button
                className="min-w-0 flex-1 bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
                disabled={signIn.isPending || isDisconnecting || !walletClient}
                onClick={handleSignIn}
                size="lg"
                type="button"
              >
                {match(signIn)
                  .with({ isPending: true }, () => <Trans>Signing in...</Trans>)
                  .with({ isError: true }, () => <Trans>Try again</Trans>)
                  .otherwise(() => (
                    <Trans>Sign in</Trans>
                  ))}
              </Button>
            </AlertDialog.Footer>

            {signIn.isError && (
              <Button
                className="-mt-2 h-auto justify-self-center p-0 font-sans text-ens-gray text-xs underline underline-offset-4 hover:text-ens-blue-midnight"
                onClick={() => setIsConfirmingSkip(true)}
                type="button"
                variant="link"
              >
                <Trans>Continue without signing in</Trans>
              </Button>
            )}
          </>
        )}
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
