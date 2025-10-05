import { ExternalLink, MessageSquare, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { TelegramStepProps } from './telegram-steps.types'

export function TelegramAuthStep({ state, actions }: TelegramStepProps) {
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

      <div className="py-6 text-center">
        <Button
          onClick={onTelegramAuth}
          disabled={isAuthenticating}
          size="lg"
          className="w-full"
        >
          <MessageSquare className="mr-2 h-5 w-5" />
          {isAuthenticating ? 'Authenticating...' : 'Sign in to Telegram'}
        </Button>
      </div>

      <Alert>
        <ExternalLink className="h-4 w-4" />
        <AlertDescription>
          After authenticating, you'll need to start the bot in Telegram to
          receive notifications.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isAuthenticating}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </>
  )
}
