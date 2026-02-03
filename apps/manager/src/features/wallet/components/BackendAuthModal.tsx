import { useWallet } from '@getpara/react-sdk-lite'
import { useMutation } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useState } from 'react'
import { useWalletClient } from 'wagmi'
import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { backendAuthStore } from '@/utils/backend-client'

export const BackendAuthModal = () => {
  const [modalStep, setModalStep] = useState<
    'verification' | 'skip-confirmation'
  >('verification')

  const isNotAuthedOrDismissed = useSelector(
    backendAuthStore,
    (state) => !state.context.authKey && state.context.modalDismissed === false,
  )
  const signIn = useMutation(signInBackendMutation)

  const { data: wallet, isLoading: walletLoading } = useWallet()
  const { data: walletClient } = useWalletClient()

  const isWalletConnected = !!wallet && !walletLoading
  const shouldShowModal = isWalletConnected && isNotAuthedOrDismissed

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

  const handleSkip = () => {
    setModalStep('skip-confirmation')
  }

  const handleConfirmSkip = () => {
    backendAuthStore.trigger.dismissModal()
    setModalStep('verification')
  }

  const handleGoBack = () => {
    setModalStep('verification')
  }

  return (
    <AlertDialog.Root
      onOpenChange={(open) => {
        if (!open) {
          if (modalStep === 'verification') {
            handleSkip()
          } else {
            handleConfirmSkip()
          }
        }
      }}
      open={shouldShowModal}
    >
      <AlertDialog.Content>
        {modalStep === 'verification' ? (
          <>
            <AlertDialog.Header>
              <AlertDialog.Title>Verify your wallet</AlertDialog.Title>
              <AlertDialog.Description>
                Sign in with your wallet to enable backend features, including
                notifications about your ENS domains, transfers, expiry
                reminders, and important updates.
              </AlertDialog.Description>
            </AlertDialog.Header>
            <div className="space-y-4">
              <Button
                className="w-full"
                disabled={signIn.isPending || !walletClient}
                onClick={handleSignIn}
                size="lg"
              >
                {signIn.isPending ? 'Signing in...' : 'Sign in with Wallet'}
              </Button>

              {signIn.isError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-destructive text-sm">
                    Failed to sign in. Please try again.
                  </p>
                </div>
              )}
              {!walletClient && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-destructive text-sm">
                    Wallet client missing, please reconnect your wallet and try
                    again.
                  </p>
                </div>
              )}
            </div>
            <AlertDialog.Footer>
              <AlertDialog.Cancel onClick={handleSkip}>
                Skip for now
              </AlertDialog.Cancel>
            </AlertDialog.Footer>
          </>
        ) : (
          <>
            <AlertDialog.Header>
              <AlertDialog.Title>Are you sure?</AlertDialog.Title>
              <AlertDialog.Description>
                Skipping SIWE verification means you won't get notifications
                about your domains or be able to save favorites while browsing.
              </AlertDialog.Description>
            </AlertDialog.Header>

            <div className="space-y-3">
              <div className="rounded-lg border border-ens-lapis-dust/50 bg-ens-lapis-dust/20 p-4">
                <h4 className="mb-2 font-medium text-ens-lapis-dense text-sm">
                  You'll miss:
                </h4>
                <ul className="space-y-1 text-ens-gray text-sm">
                  <li>• Domain transfer & expiry notifications</li>
                  <li>• Saved favorites & searches</li>
                  <li>• And more...</li>
                </ul>
              </div>

              <div className="rounded-lg bg-ens-peridot-dust/30 p-3">
                <p className="text-ens-peridot-text-medium text-xs">
                  💡 You can verify later by clicking your profile in the navbar
                </p>
              </div>
            </div>

            <AlertDialog.Footer>
              <Button onClick={handleGoBack} variant="outline">
                Go Back
              </Button>
              <Button onClick={handleConfirmSkip} variant="destructive">
                Skip Anyway
              </Button>
            </AlertDialog.Footer>
          </>
        )}
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
