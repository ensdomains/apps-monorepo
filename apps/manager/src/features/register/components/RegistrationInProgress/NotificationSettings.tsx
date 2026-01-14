/**
 * NotificationSettings Component
 *
 * Manages user notification preferences during ENS registration flow.
 *
 * API Integration:
 * - Currently uses MOCK mode (USE_MOCK_API = true)
 * - To activate real API: Set USE_MOCK_API = false in notificationService.ts
 * - Requires authentication (cookies/session)
 *
 * API Endpoints Used:
 * - POST /api/channels/email - Add/verify email channel
 * - POST /api/channels/telegram - Add telegram channel (OAuth flow)
 * - PATCH /api/preferences/batch - Update all preferences at once
 *
 * See notification worker API for full schema.
 */
'use client'

import { useForm } from '@tanstack/react-form'
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle,
  Clock,
  Heart,
  Mail,
  MessageCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  addEmailChannel,
  isValidEmail,
  resendEmailVerification,
  USE_MOCK_API,
  updatePreferencesBatch,
} from '@/features/register/services/notificationService'
import { cn } from '@/lib/utils'

interface NotificationSettingsProps {
  onConfirm: (settings: NotificationPreferences) => void
  onSkip: () => void
  className?: string
}

export interface NotificationPreferences {
  email: string
  emailVerified: boolean
  telegramConnected: boolean
  nameExpiry: boolean
  nameTransfers: boolean
  ensLabsUpdates: boolean
}

export const NotificationSettings = ({
  onConfirm,
  onSkip,
  className,
}: NotificationSettingsProps) => {
  const [isTelegramConnecting, setIsTelegramConnecting] = useState(false)
  const [emailVerificationSent, setEmailVerificationSent] = useState(false)
  const [isResendingVerification, setIsResendingVerification] = useState(false)

  const form = useForm({
    defaultValues: {
      email: '',
      telegramConnected: false,
      nameExpiry: true,
      nameTransfers: true,
      ensLabsUpdates: false,
    },
    onSubmit: async ({ value }) => {
      try {
        if (value.email && value.email.trim().length > 0) {
          const result = await addEmailChannel(value.email)
          setEmailVerificationSent(result.verificationSent)
        }

        const preferencesPayload: Record<string, Record<string, boolean>> = {}

        if (value.email && value.email.trim().length > 0) {
          preferencesPayload.email = {
            'name-expiry': value.nameExpiry,
            'name-transfers': value.nameTransfers,
            'ens-labs-updates': value.ensLabsUpdates,
          }
        }

        if (value.telegramConnected) {
          preferencesPayload.telegram = {
            'name-expiry': value.nameExpiry,
            'name-transfers': value.nameTransfers,
            'ens-labs-updates': value.ensLabsUpdates,
          }
        }

        if (Object.keys(preferencesPayload).length > 0) {
          await updatePreferencesBatch(preferencesPayload)
        }

        if (USE_MOCK_API) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        const preferences: NotificationPreferences = {
          email: value.email || '',
          emailVerified: false,
          telegramConnected: value.telegramConnected,
          nameExpiry: value.nameExpiry,
          nameTransfers: value.nameTransfers,
          ensLabsUpdates: value.ensLabsUpdates,
        }

        console.log(
          '🎉 Notification preferences submitted successfully:',
          preferences,
        )
        onConfirm(preferences)
      } catch (error) {
        console.error('❌ Failed to submit notification preferences:', error)
        const preferences: NotificationPreferences = {
          email: value.email || '',
          emailVerified: false,
          telegramConnected: value.telegramConnected,
          nameExpiry: value.nameExpiry,
          nameTransfers: value.nameTransfers,
          ensLabsUpdates: value.ensLabsUpdates,
        }
        onConfirm(preferences)
      }
    },
  })

  const handleTelegramSignup = async () => {
    setIsTelegramConnecting(true)

    try {
      console.log('Initiating Telegram signup...')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      form.setFieldValue('telegramConnected', true)
      console.log('Telegram connected successfully (mocked)')
    } catch (error) {
      console.error('Telegram signup failed:', error)
    } finally {
      setIsTelegramConnecting(false)
    }
  }

  const isFormValid = () => {
    const emailValue = form.getFieldValue('email')
    const telegramConnected = form.getFieldValue('telegramConnected')
    const hasEmail = emailValue && emailValue.trim().length > 0

    return hasEmail || telegramConnected
  }

  const handleResendVerification = async () => {
    const emailValue = form.getFieldValue('email')
    if (!emailValue || emailValue.trim().length === 0) return

    setIsResendingVerification(true)
    try {
      await resendEmailVerification(emailValue)
      console.log('✅ Verification email resent')
    } catch (error) {
      console.error('❌ Failed to resend verification:', error)
    } finally {
      setIsResendingVerification(false)
    }
  }

  return (
    <form
      className={cn('flex flex-col gap-6 bg-gray-100 px-5 py-6', className)}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl text-ens-blue-dark leading-9 tracking-tight">
          Notification Settings
        </h2>
        <p className="text-base text-ens-gray leading-[19.6px]">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) =>
              isValidEmail(value) ? undefined : 'Please enter a valid email',
          }}
        >
          {(field) => {
            const hasValidEmail =
              field.state.value &&
              field.state.value.trim().length > 0 &&
              isValidEmail(field.state.value) &&
              field.state.meta.errors.length === 0

            return (
              <div className="flex flex-col gap-3 rounded-lg border border-ens-gray-two bg-white p-5">
                <div className="flex items-start gap-2">
                  <Mail className="h-5 w-5 shrink-0 text-ens-lapis-surface" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-base text-ens-blue-dark leading-6">
                      Email Notifications
                    </p>
                    <p className="text-ens-gray text-sm leading-[19.6px]">
                      Receive notifications via email for important domain
                      events
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="relative flex flex-col gap-1">
                    <Input
                      className={cn(
                        'h-12 rounded border-ens-blue bg-white pr-10 text-sm placeholder:text-ens-gray-three',
                        field.state.meta.errors.length > 0 && 'border-red-500',
                      )}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        // Reset verification sent status when email changes
                        if (emailVerificationSent) {
                          setEmailVerificationSent(false)
                        }
                      }}
                      placeholder="enter email"
                      type="email"
                      value={field.state.value || ''}
                    />
                    {hasValidEmail && (
                      <CheckCircle className="absolute top-3 right-3 h-6 w-6 text-ens-peridot-core" />
                    )}
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-red-500 text-xs">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>

                  {hasValidEmail && (
                    <div className="flex items-start gap-2 rounded-lg bg-ens-lapis-dust p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ens-blue" />
                      <p className="text-ens-blue text-sm leading-[19.6px]">
                        This email has not been verified. Click the link in the
                        email to verify or{' '}
                        <button
                          className="font-medium underline transition-opacity hover:opacity-80 disabled:opacity-50"
                          disabled={isResendingVerification}
                          onClick={handleResendVerification}
                          type="button"
                        >
                          {isResendingVerification
                            ? 'sending...'
                            : 'resend the link'}
                        </button>{' '}
                        to receive email notifications.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          }}
        </form.Field>

        <form.Field name="telegramConnected">
          {(field) => (
            <div className="flex flex-col gap-2">
              <button
                className={cn(
                  'flex w-fit items-center justify-center gap-3.5 rounded-full px-4 py-2.5 transition-colors',
                  field.state.value
                    ? 'cursor-not-allowed bg-ens-peridot-core'
                    : 'bg-ens-lapis-core hover:bg-ens-lapis-core/90',
                  isTelegramConnecting && 'cursor-wait opacity-50',
                )}
                disabled={isTelegramConnecting || field.state.value}
                onClick={handleTelegramSignup}
                type="button"
              >
                <MessageCircle className="h-5 w-5 text-white" />
                <span className="font-medium text-base text-white leading-[15.36px] tracking-tight">
                  {field.state.value
                    ? 'Telegram Connected ✓'
                    : isTelegramConnecting
                      ? 'Connecting...'
                      : 'Sign up with Telegram'}
                </span>
              </button>
              <p className="text-ens-gray text-sm leading-[19.6px]">
                Get instant updates through Telegram for your domains
              </p>
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex flex-col gap-3">
        <form.Field name="nameExpiry">
          {(field) => (
            <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
              <div className="flex items-start gap-2">
                <Clock className="h-5 w-5 shrink-0 text-ens-lapis-surface" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                      Name Expiry
                    </p>
                    <span className="rounded bg-ens-lapis-dust px-2 py-0.5 text-ens-blue-dark text-xs leading-[16.5px]">
                      Recommended
                    </span>
                  </div>
                  <p className="text-ens-gray text-xs leading-[18.2px]">
                    You&apos;ll be notified 30, 7, and 1 day before expiry.
                  </p>
                </div>
              </div>
              <Switch
                checked={field.state.value}
                className="shrink-0"
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="nameTransfers">
          {(field) => (
            <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
              <div className="flex items-start gap-2">
                <ArrowLeftRight className="h-5 w-5 shrink-0 text-ens-lapis-surface" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                      Name Transfers
                    </p>
                    <span className="rounded bg-ens-lapis-dust px-2 py-0.5 text-ens-blue-dark text-xs leading-[16.5px]">
                      Recommended
                    </span>
                  </div>
                  <p className="text-ens-gray text-xs leading-[18.2px]">
                    Get notified when your domains are transferred to another
                    wallet
                  </p>
                </div>
              </div>
              <Switch
                checked={field.state.value}
                className="shrink-0"
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="ensLabsUpdates">
          {(field) => (
            <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
              <div className="flex items-start gap-2">
                <Heart className="h-5 w-5 shrink-0 text-ens-lapis-surface" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                    ENS Labs Updates
                  </p>
                  <p className="text-ens-gray text-xs leading-[18.2px]">
                    Get updated on the latest releases and features
                  </p>
                </div>
              </div>
              <Switch
                checked={field.state.value}
                className="shrink-0"
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex flex-col gap-3">
        <form.Subscribe selector={(state) => [state.isSubmitting]}>
          {([isSubmitting]) => {
            const isValid = isFormValid()
            return (
              <Button
                className={cn(
                  'h-[74px] w-full rounded font-medium font-mono text-sm uppercase tracking-wider transition-colors',
                  isValid
                    ? 'bg-ens-blue text-white hover:bg-ens-blue-hover'
                    : 'cursor-not-allowed bg-ens-gray-two text-ens-gray hover:bg-ens-gray-two',
                )}
                disabled={!isValid || isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Saving...' : 'Confirm Preferences'}
              </Button>
            )
          }}
        </form.Subscribe>
        <Button
          className="h-[74px] w-full rounded border-ens-blue bg-ens-white font-medium font-mono text-ens-blue text-sm uppercase tracking-wider hover:bg-ens-white"
          onClick={onSkip}
          type="button"
          variant="outline"
        >
          Skip
        </Button>
      </div>
    </form>
  )
}
