import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  addEmailChannelMutationOptions,
  verifyEmailMutationOptions,
} from '../../../queries/channels'
import type { EmailChannelFormProps, EmailStep } from '../../../types/email'
import { StepIndicator } from '../../shared/step-indicator'
import { EmailSendStep } from './email-send-step'
import { EmailVerifyStep } from './email-verify-step'

export const EmailChannelForm = ({
  onSuccess,
  onCancel,
}: EmailChannelFormProps) => {
  const [currentStep, setCurrentStep] = useState<EmailStep>('send')

  const addEmailChannelMutation = useMutation({
    ...addEmailChannelMutationOptions,
    onSuccess: () => {
      toast.success('Verification email sent! Check your inbox.')
      setCurrentStep('verify')
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to send verification email'
      toast.error(errorMessage)
    },
  })

  const verifyEmailMutation = useMutation({
    ...verifyEmailMutationOptions,
    onSuccess: () => {
      toast.success('Email verified successfully!')
      onSuccess()
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to verify email'
      toast.error(errorMessage)
    },
  })

  const handleSendEmail = (emailAddress: string) => {
    addEmailChannelMutation.mutate({ email: emailAddress })
  }

  const handleVerifyCode = (token: string) => {
    verifyEmailMutation.mutate(token)
  }

  const handleBackToSend = () => {
    setCurrentStep('send')
    addEmailChannelMutation.reset()
    verifyEmailMutation.reset()
  }

  const getCurrentStepNumber = () => {
    return currentStep === 'send' ? 1 : 2
  }

  const getCompletedSteps = () => {
    const completed: number[] = []
    if (currentStep === 'verify') completed.push(1)
    if (verifyEmailMutation.isSuccess) completed.push(2)
    return completed
  }

  return (
    <div className="space-y-4">
      <StepIndicator
        completedSteps={getCompletedSteps()}
        currentStep={getCurrentStepNumber()}
        totalSteps={2}
      />

      {currentStep === 'send' && (
        <EmailSendStep
          emailError={addEmailChannelMutation.error?.message || null}
          isSendingEmail={addEmailChannelMutation.isPending}
          onCancel={onCancel}
          onSendEmail={handleSendEmail}
        />
      )}

      {currentStep === 'verify' && (
        <EmailVerifyStep
          channelId={addEmailChannelMutation.data?.channelId || ''}
          isVerified={verifyEmailMutation.isSuccess}
          isVerifying={verifyEmailMutation.isPending}
          onBackToSend={handleBackToSend}
          onCancel={onCancel}
          onSuccess={onSuccess}
          onVerifyCode={handleVerifyCode}
          verificationError={verifyEmailMutation.error?.message || null}
        />
      )}
    </div>
  )
}
