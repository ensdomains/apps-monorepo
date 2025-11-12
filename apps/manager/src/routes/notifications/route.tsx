import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useAtom } from '@xstate/store/react'
import { Button } from '@/components/ui/button'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { isBackendAuthed } from '@/utils/backend-client'

export const Route = createFileRoute('/notifications')({
  component: RouteComponent,
})

function RouteComponent() {
  const isAuthed = useAtom(isBackendAuthed)

  if (!isAuthed) {
    return <UnauthenticatedContent />
  }

  return <Outlet />
}

const UnauthenticatedContent = () => {
  const signIn = useMutation(signInBackendMutation)

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync()
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }

  return (
    <div className="">
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="space-y-4 text-center">
          <div className="space-y-2">
            <h3 className="font-medium text-lg">Connect your wallet</h3>
            <p className="text-muted-foreground text-sm">
              Sign in to access notifications about your ENS domains, including
              transfers, expiry reminders, and important updates.
            </p>
          </div>

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
      </div>
    </div>
  )
}
