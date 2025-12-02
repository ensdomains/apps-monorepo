import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useAtom } from '@xstate/store/react'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AllNotifications } from '@/features/notifications/components'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { isBackendAuthed } from '@/utils/backend-client'

export const Route = createFileRoute('/notifications/all')({
  component: RouteComponent,
})

function RouteComponent() {
  const isAuthed = useAtom(isBackendAuthed)
  const signIn = useMutation(signInBackendMutation)
  const { data: walletClient } = useWalletClient()

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

  if (!isAuthed) {
    return (
      <div className="mx-auto my-5 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Sign in to view your notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Connect your wallet to access your ENS domain notifications,
                including transfers, expiry reminders, and important updates.
              </p>
              <Button
                onClick={handleSignIn}
                disabled={signIn.isPending}
                className="w-full"
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
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto my-5 max-w-md">
      <AllNotifications />
    </div>
  )
}
