import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CheckCircle, Mail, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import * as v from 'valibot'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmailVerifyStep } from '@/features/notifications/components/channels/email/email-verify-step'
import { verifyEmailMutationOptions } from '@/features/notifications/queries/channels'

// Shared card wrapper component
function VerificationCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <Card>{children}</Card>
      </div>
    </div>
  )
}

// Shared card header component
function VerificationHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <CardHeader className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <CardTitle className="mt-4">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  )
}

export const Route = createFileRoute('/notifications/channels/email/verify')({
  component: EmailVerificationPage,
  validateSearch: v.object({
    token: v.optional(v.string()),
  }),
  loaderDeps: ({ search: { token } }) => ({
    token,
  }),
})

function EmailVerificationPage() {
  const { token } = Route.useLoaderDeps()
  const navigate = useNavigate()

  const verifyEmailMutation = useMutation(verifyEmailMutationOptions)

  const handleContinue = () => {
    navigate({ to: '/notifications/settings' })
  }

  const handleVerify = (verificationToken?: string) => {
    const tokenToUse = verificationToken || token
    if (!tokenToUse) return

    verifyEmailMutation.mutate(tokenToUse, {
      onSuccess: () => {
        toast.success('Email verified successfully')
        setTimeout(() => {
          navigate({ to: '/notifications/settings' })
        }, 1200)
      },
      onError: () => {
        toast.error('Failed to verify email')
      },
    })
  }

  // If no token, show manual code entry using the shared component
  if (!token) {
    return (
      <VerificationCard>
        <VerificationHeader
          description="Enter the verification code from your email to verify your address."
          icon={<Mail className="h-6 w-6 text-gray-400" />}
          title="Enter Verification Code"
        />
        <CardContent>
          <EmailVerifyStep
            channelId=""
            isVerified={verifyEmailMutation.isSuccess}
            isVerifying={verifyEmailMutation.isPending}
            onBackToSend={() => {}}
            onCancel={handleContinue}
            onSuccess={handleContinue} // Not applicable for this route
            onVerifyCode={(code) => handleVerify(code)}
            verificationError={verifyEmailMutation.error?.message || null}
          />
        </CardContent>
      </VerificationCard>
    )
  }

  // Determine current state
  const isPending = verifyEmailMutation?.status === 'pending'
  const isSuccess = verifyEmailMutation?.status === 'success'
  const isError = verifyEmailMutation?.status === 'error'

  // Get appropriate icon, title, and description
  const icon = isPending ? (
    <Mail className="h-6 w-6 animate-pulse text-gray-400" />
  ) : isSuccess ? (
    <CheckCircle className="h-6 w-6 text-green-600" />
  ) : isError ? (
    <XCircle className="h-6 w-6 text-red-600" />
  ) : (
    <Mail className="h-6 w-6 text-gray-400" />
  )

  const title = isPending
    ? 'Verifying Email...'
    : isSuccess
      ? 'Email Verified!'
      : isError
        ? 'Verification Failed'
        : 'Verify Your Email'

  const description = isPending
    ? 'Please wait while we verify your email address.'
    : isSuccess
      ? 'You can now receive notifications at this email address.'
      : isError
        ? 'There was a problem verifying your email address.'
        : 'Click the button below to verify your email address and start receiving notifications.'

  return (
    <VerificationCard>
      <VerificationHeader description={description} icon={icon} title={title} />
      <CardContent className="space-y-4">
        {/* Error message */}
        {isError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {verifyEmailMutation.error?.message ||
                'An error occurred during verification'}
            </AlertDescription>
          </Alert>
        )}

        {/* Success message */}
        {isSuccess && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Your email has been verified successfully!
            </AlertDescription>
          </Alert>
        )}

        {/* Loading spinner */}
        {isPending && (
          <div className="py-4 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-current border-r-transparent border-solid motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          </div>
        )}

        {/* Action buttons */}
        {isError ? (
          <div className="space-y-2">
            <Button className="w-full" onClick={() => handleVerify()}>
              Try Again
            </Button>
            <Button
              className="w-full"
              onClick={handleContinue}
              variant="outline"
            >
              Continue to Settings
            </Button>
          </div>
        ) : isSuccess ? (
          <Button className="w-full" onClick={handleContinue}>
            Continue to Settings
          </Button>
        ) : (
          <div className="space-y-2">
            <Button className="w-full" onClick={() => handleVerify()}>
              Verify Email Address
            </Button>
            <Button asChild className="w-full" variant="outline">
              <Link to="/notifications/settings">Back to Settings</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </VerificationCard>
  )
}
