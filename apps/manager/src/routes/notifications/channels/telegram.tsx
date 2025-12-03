import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { TelegramAuthData } from 'api-worker/types'
import { ArrowRight, CheckCircle, MessageSquare, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  addTelegramChannelMutationOptions,
  telegramAuthMutationOptions,
} from '@/features/notifications/queries/channels'
import { decodeTelegramAuthDataFromUrlHash } from '@/features/notifications/telegram'

export const Route = createFileRoute('/notifications/channels/telegram')({
  component: TelegramConnectPage,
  loader: ({ location, preload }) => {
    if (preload) {
      return {
        authData: null,
      }
    }

    const authData = decodeTelegramAuthDataFromUrlHash(location.hash)

    return {
      authData,
    }
  },
})

function TelegramConnectPage() {
  const navigate = useNavigate()
  const { authData: initialAuthData } = Route.useLoaderData()
  const [currentStep, setCurrentStep] = useState<'auth' | 'create'>(
    initialAuthData ? 'create' : 'auth',
  )
  const [telegramAuthData, setTelegramAuthData] =
    useState<TelegramAuthData | null>(initialAuthData)

  const telegramAuthMutation = useMutation({
    ...telegramAuthMutationOptions,
    onSuccess: (authData) => {
      setTelegramAuthData(authData)
      setCurrentStep('create')
      toast.success('Telegram authentication successful!')
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage === 'Popup blocked') {
        toast.error('Please allow popups to connect Telegram')
      } else if (errorMessage === 'Popup closed before authentication') {
        toast.error('Telegram authentication was cancelled')
      } else {
        toast.error('Failed to authenticate with Telegram')
      }
    },
  })

  const addTelegramChannelMutation = useMutation({
    ...addTelegramChannelMutationOptions,
    onSuccess: () => {
      toast.success('Telegram notification channel created successfully!')
      navigate({ to: '/notifications/settings' })
    },
    onError: () => {
      toast.error('Failed to create Telegram notification channel')
    },
  })

  const handleTelegramAuth = () => {
    telegramAuthMutation.mutate()
  }

  const handleCreateChannel = () => {
    if (telegramAuthData) {
      addTelegramChannelMutation.mutate({ auth_data: telegramAuthData })
    }
  }

  const handleBackToAuth = () => {
    setCurrentStep('auth')
    setTelegramAuthData(null)
    telegramAuthMutation.reset()
  }

  const handleContinue = () => {
    navigate({ to: '/notifications/settings' })
  }

  const isAuthenticating = telegramAuthMutation.isPending
  const authError = telegramAuthMutation.error?.message
  const isCreatingChannel = addTelegramChannelMutation.isPending
  const isChannelCreated = addTelegramChannelMutation.isSuccess
  const channelError = addTelegramChannelMutation.error?.message

  // Auto-advance to step 2 if we already have auth data
  useEffect(() => {
    if (initialAuthData && currentStep === 'auth') {
      setCurrentStep('create')
      setTelegramAuthData(initialAuthData)
    }
  }, [initialAuthData, currentStep])

  return (
    <div className="flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center space-x-4">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
              currentStep === 'auth'
                ? 'bg-blue-600 text-white'
                : telegramAuthData
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 text-gray-600'
            }`}
          >
            1
          </div>
          <div className="h-0.5 w-8 bg-gray-300"></div>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm ${
              currentStep === 'create'
                ? 'bg-blue-600 text-white'
                : isChannelCreated
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 text-gray-600'
            }`}
          >
            2
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              {currentStep === 'auth' && !isAuthenticating && !authError && (
                <MessageSquare className="h-6 w-6 text-gray-400" />
              )}
              {isAuthenticating && (
                <MessageSquare className="h-6 w-6 animate-pulse text-blue-600" />
              )}
              {currentStep === 'auth' && authError && (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              {currentStep === 'create' &&
                !isCreatingChannel &&
                !isChannelCreated &&
                !channelError && (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                )}
              {isCreatingChannel && (
                <MessageSquare className="h-6 w-6 animate-pulse text-blue-600" />
              )}
              {isChannelCreated && (
                <CheckCircle className="h-6 w-6 text-green-600" />
              )}
              {channelError && <XCircle className="h-6 w-6 text-red-600" />}
            </div>
            <CardTitle className="mt-4">
              {currentStep === 'auth' &&
                !isAuthenticating &&
                !authError &&
                'Step 1: Sign in to Telegram'}
              {isAuthenticating && 'Authenticating with Telegram...'}
              {currentStep === 'auth' && authError && 'Authentication Failed'}
              {currentStep === 'create' &&
                !isCreatingChannel &&
                !isChannelCreated &&
                !channelError &&
                'Step 2: Create Notification Channel'}
              {isCreatingChannel && 'Creating Channel...'}
              {isChannelCreated && 'Channel Created!'}
              {channelError && 'Channel Creation Failed'}
            </CardTitle>
            <CardDescription>
              {currentStep === 'auth' &&
                !isAuthenticating &&
                !authError &&
                'First, we need to authenticate with your Telegram account'}
              {isAuthenticating &&
                'Please complete the authentication in the popup window.'}
              {currentStep === 'auth' &&
                authError &&
                'There was a problem authenticating with Telegram.'}
              {currentStep === 'create' &&
                !isCreatingChannel &&
                !isChannelCreated &&
                !channelError &&
                'Now create a notification channel to receive ENS updates'}
              {isCreatingChannel &&
                'Setting up your Telegram notification channel...'}
              {isChannelCreated &&
                'Your Telegram notification channel is ready!'}
              {channelError &&
                'There was a problem creating the notification channel.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Authentication */}
            {currentStep === 'auth' && (
              <>
                {authError && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{authError}</AlertDescription>
                  </Alert>
                )}

                {isAuthenticating && (
                  <div className="py-4 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-r-transparent border-solid motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                  </div>
                )}

                {!isAuthenticating && !authError && (
                  <Button
                    onClick={handleTelegramAuth}
                    className="w-full"
                    size="lg"
                  >
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Sign in to Telegram
                  </Button>
                )}

                {authError && (
                  <div className="space-y-2">
                    <Button onClick={handleTelegramAuth} className="w-full">
                      Try Again
                    </Button>
                    <Button
                      onClick={handleContinue}
                      variant="outline"
                      className="w-full"
                    >
                      Skip for Now
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Create Channel */}
            {currentStep === 'create' && (
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

                {isCreatingChannel && (
                  <div className="py-4 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-r-transparent border-solid motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                  </div>
                )}

                {!isCreatingChannel && !isChannelCreated && !channelError && (
                  <Button
                    onClick={handleCreateChannel}
                    className="w-full"
                    size="lg"
                  >
                    <ArrowRight className="mr-2 h-5 w-5" />
                    Create Notification Channel
                  </Button>
                )}

                {channelError && (
                  <div className="space-y-2">
                    <Button onClick={handleCreateChannel} className="w-full">
                      Try Again
                    </Button>
                    <Button
                      onClick={handleBackToAuth}
                      variant="outline"
                      className="w-full"
                    >
                      Use Different Account
                    </Button>
                  </div>
                )}

                {!isChannelCreated && (
                  <Button
                    onClick={handleBackToAuth}
                    variant="outline"
                    className="w-full"
                  >
                    Back to Authentication
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
