import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Mail, XCircle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { channelQueryOptions } from '@/features/notifications/queries/channels'

interface EmailVerifyStepProps {
  channelId: string
  isVerifying: boolean
  isVerified: boolean
  verificationError: string | null
  onVerifyCode: (token: string) => void
  onBackToSend: () => void
  onCancel: () => void
  onSuccess: () => void
}

export function EmailVerifyStep({
  channelId,
  isVerifying,
  isVerified,
  verificationError,
  onVerifyCode,
  onBackToSend,
  onCancel,
  onSuccess,
}: EmailVerifyStepProps) {
  const [verificationCode, setVerificationCode] = useState('')
  const verificationCodeId = useId()

  const channelQuery = useQuery({
    ...channelQueryOptions(channelId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  const queryClient = useQueryClient()

  useEffect(() => {
    if (channelQuery.data?.status === 'verified') {
      onSuccess()
      queryClient.invalidateQueries({
        queryKey: $qk({
          $scope: 'channels',
        }),
      })
    }
  }, [channelQuery.data, onSuccess, queryClient])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (verificationCode.trim()) {
      onVerifyCode(verificationCode.trim())
    }
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          We sent a verification code to your email address.
        </AlertDescription>
      </Alert>

      {isVerified && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Email verified successfully! You can now receive notifications.
          </AlertDescription>
        </Alert>
      )}

      {verificationError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{verificationError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={verificationCodeId}>Verification Code</Label>
          <Input
            id={verificationCodeId}
            type="text"
            placeholder="Enter 6-digit code"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            disabled={isVerifying || isVerified}
            required
          />
        </div>

        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>
            Check your email for the verification code. You can also click the
            link in the email to verify automatically.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onBackToSend}
            disabled={isVerifying}
            className="flex-1"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            type="submit"
            disabled={isVerifying || isVerified || !verificationCode.trim()}
            className="flex-1"
          >
            {isVerifying ? 'Verifying...' : 'Verify Code'}
          </Button>
        </div>
      </form>

      {verificationError && (
        <div className="space-y-2">
          <Button
            onClick={() => onVerifyCode(verificationCode)}
            disabled={isVerifying}
            className="w-full"
          >
            Try Again
          </Button>
          <Button onClick={onBackToSend} variant="outline" className="w-full">
            Use Different Email
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isVerifying}
        className="w-full"
      >
        Cancel
      </Button>
    </div>
  )
}
