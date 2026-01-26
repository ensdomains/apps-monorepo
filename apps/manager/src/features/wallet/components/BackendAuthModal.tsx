import { useWallet } from '@getpara/react-sdk-lite'
import { useMutation } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useWalletClient } from 'wagmi'
import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { backendAuthStore } from '@/utils/backend-client'

export const BackendAuthModal = () => {
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
    backendAuthStore.trigger.dismissModal()
  }

  return (
    <AlertDialog.Root
      onOpenChange={(open) => {
        if (!open) handleSkip()
      }}
      open={shouldShowModal}
    >
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Verify your wallet</AlertDialog.Title>
          <AlertDialog.Description>
            Sign in with your wallet to enable backend features, including
            notifications about your ENS domains, transfers, expiry reminders,
            and important updates.
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
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
