import { Trans } from '@lingui/react/macro'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useConnection, useWalletClient } from 'wagmi'
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

  const { isConnected: isWalletConnected } = useConnection()
  const { data: walletClient } = useWalletClient()
  const { disconnect, isDisconnecting } = useWalletDisconnect()

  // Hold this modal until the SCA is live. Hook is null before the
  // provider mounts; then we don't wait, so EOA-only isn't stuck.
  const smartAccount = useSmartAccountContextSafe()
  const isSmartAccountReady =
    smartAccount === null || smartAccount.isAccountReady || !!smartAccount.error
  const shouldShowModal =
    isWalletConnected && isNotAuthedOrDismissed && isSmartAccountReady

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
        onEscapeKeyDown={(event) => {
          event.preventDefault()
        }}
      >
        <AlertDialog.Header>
          <AlertDialog.Title>
            <Trans>Verify your wallet</Trans>
          </AlertDialog.Title>
          <AlertDialog.Description>
            <Trans>
              Sign in with your wallet to enable backend features, including
              notifications about your ENS domains, transfers, expiry reminders,
              and important updates.
            </Trans>
          </AlertDialog.Description>
        </AlertDialog.Header>
        <div className="space-y-4">
          <Button
            className="w-full"
            disabled={signIn.isPending || isDisconnecting || !walletClient}
            onClick={handleSignIn}
            size="lg"
          >
            {signIn.isPending ? (
              <Trans>Signing in...</Trans>
            ) : (
              <Trans>Sign in with Wallet</Trans>
            )}
          </Button>
          <Button
            className="w-full"
            disabled={signIn.isPending || isDisconnecting}
            onClick={() => void disconnect()}
            size="lg"
            variant="outline"
          >
            {isDisconnecting ? (
              <Trans>Disconnecting...</Trans>
            ) : (
              <Trans>Disconnect</Trans>
            )}
          </Button>

          {signIn.isError && (
            <>
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-destructive text-sm">
                  <Trans>Failed to sign in. Please try again.</Trans>
                </p>
              </div>
              <div className="rounded-lg border border-ens-lapis-dust/50 bg-ens-lapis-dust/20 p-4">
                <p className="font-medium text-sm">
                  <Trans>Continue without signing in?</Trans>
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  <Trans>
                    You can still use the manager, but these features won't be
                    available:
                  </Trans>
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                  <li>
                    <Trans>Domain transfer and expiry notifications</Trans>
                  </li>
                  <li>
                    <Trans>Saved favorites and searches</Trans>
                  </li>
                </ul>
                <p className="mt-3 text-muted-foreground text-xs">
                  <Trans>
                    To enable these features later, open your wallet menu and
                    select Verify wallet ownership.
                  </Trans>
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => backendAuthStore.trigger.dismissModal()}
                size="lg"
                variant="outline"
              >
                <Trans>Continue without signing in</Trans>
              </Button>
            </>
          )}
          {!walletClient && !isDisconnecting && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-destructive text-sm">
                <Trans>
                  Wallet client missing, please reconnect your wallet and try
                  again.
                </Trans>
              </p>
            </div>
          )}
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
