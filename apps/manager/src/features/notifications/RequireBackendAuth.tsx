import { useModal } from '@getpara/react-sdk-lite'
import { useMutation } from '@tanstack/react-query'
import { useAtom, useSelector } from '@xstate/store-react'
import type { ReactNode } from 'react'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { signInBackendMutation } from '@/features/notifications/data/queries/auth'
import { useParaWalletStatus } from '@/lib/para'
import { useSmartAccountContext } from '@/lib/smart-account'
import { backendAuthStore, isBackendAuthed } from '@/utils/backend-client'

interface RequireBackendAuthProps {
  children: ReactNode
}

export const RequireBackendAuth = ({ children }: RequireBackendAuthProps) => {
  const signIn = useMutation(signInBackendMutation)
  const isAuthed = useAtom(isBackendAuthed)
  const authAddress = useSelector(
    backendAuthStore,
    (state) => state.context.address,
  )
  const { data: walletClient } = useWalletClient()
  const { ownerAddress } = useSmartAccountContext()
  const { openModal } = useModal()

  const walletStatus = useParaWalletStatus()

  if (walletStatus === 'pending') {
    return (
      <div className="mx-auto max-w-md px-4 py-6 text-center">
        <p className="text-muted-foreground text-sm">
          Checking wallet connection...
        </p>
      </div>
    )
  }

  // This should never happen, but just in case
  const isWrongWallet =
    !!authAddress &&
    !!ownerAddress &&
    authAddress.toLowerCase() !== ownerAddress.toLowerCase()

  if (isWrongWallet) {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="space-y-4 text-center">
          <h3 className="font-medium text-lg">Wrong wallet connected</h3>
          <p className="text-muted-foreground text-sm">
            Reconnect the wallet used for notifications, then sign in again.
          </p>
          {/* Show the two addresses */}
          <div className="flex flex-col gap-2">
            <div>Auth address: {authAddress}</div>
            <div>Account address: {ownerAddress}</div>
          </div>
          <Button className="w-full" onClick={() => openModal()} size="lg">
            Reconnect Wallet
          </Button>
        </div>
      </div>
    )
  }

  if (isAuthed) {
    return <>{children}</>
  }

  if (walletStatus === 'disconnected') {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="space-y-4 text-center">
          <h3 className="font-medium text-lg">Connect your wallet</h3>
          <p className="text-muted-foreground text-sm">
            Connect a wallet to continue to notification settings and activity.
          </p>
          <Button className="w-full" onClick={() => openModal()} size="lg">
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  const handleSignIn = async () => {
    try {
      if (!walletClient) {
        throw new Error('No wallet client found')
      }

      await signIn.mutateAsync({ walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="space-y-4 text-center">
        <div className="space-y-2">
          <h3 className="font-medium text-lg">Verify wallet ownership</h3>
          <p className="text-muted-foreground text-sm">
            Sign in to access notifications about your ENS domains, including
            transfers, expiry reminders, and important updates.
          </p>
        </div>

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
      </div>
    </div>
  )
}
