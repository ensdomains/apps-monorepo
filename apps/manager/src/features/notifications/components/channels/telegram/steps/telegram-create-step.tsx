import { ArrowLeft, ArrowRight, CheckCircle, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { TelegramStepProps } from './types'

export const TelegramCreateStep = ({ state, actions }: TelegramStepProps) => {
  const {
    telegramAuthData,
    isCreatingChannel,
    isChannelCreated,
    channelError,
  } = state
  const { onCreateChannel, onBackToAuth } = actions

  return (
    <>
      {telegramAuthData && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Authenticated as {telegramAuthData.first_name}{' '}
            {telegramAuthData.last_name}
          </AlertDescription>
        </Alert>
      )}

      {channelError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{channelError}</AlertDescription>
        </Alert>
      )}

      <div className="text-center">
        <Button
          className="w-full"
          disabled={isCreatingChannel}
          onClick={onCreateChannel}
          size="lg"
        >
          <ArrowRight className="mr-2 h-5 w-5" />
          {isCreatingChannel
            ? 'Creating Channel...'
            : 'Create Notification Channel'}
        </Button>
      </div>

      <div className="flex gap-2">
        {!isChannelCreated && (
          <Button
            className="flex-1"
            disabled={isCreatingChannel}
            onClick={onBackToAuth}
            type="button"
            variant="outline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Authentication
          </Button>
        )}
      </div>
    </>
  )
}
