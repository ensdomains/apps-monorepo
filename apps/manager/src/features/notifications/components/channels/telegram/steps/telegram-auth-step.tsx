import { ExternalLink, MessageSquare, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { TelegramStepProps } from './types'

export const TelegramAuthStep = ({ state, actions }: TelegramStepProps) => {
  const { isAuthenticating, authError } = state
  const { onTelegramAuth, onCancel } = actions

  return (
    <>
      <Alert>
        <MessageSquare className="h-4 w-4" />
        <AlertDescription>
          First, we need to authenticate with your Telegram account. This will
          open a secure popup window.
        </AlertDescription>
      </Alert>

      {authError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      )}

      <div className="text-center">
        <Button
          className="w-full"
          disabled={isAuthenticating}
          onClick={onTelegramAuth}
          size="lg"
        >
          <MessageSquare className="mr-2 h-5 w-5" />
          {isAuthenticating ? 'Authenticating...' : 'Sign in to Telegram'}
        </Button>
      </div>

      <hr className="my-4" />

      <Alert>
        <ExternalLink className="h-4 w-4" />
        <AlertDescription>
          After authenticating, you'll need to start the bot in Telegram to
          receive notifications.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={isAuthenticating}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </>
  )
}
