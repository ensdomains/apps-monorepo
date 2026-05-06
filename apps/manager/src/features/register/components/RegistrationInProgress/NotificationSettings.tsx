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

import { Trans, useLingui } from '@lingui/react/macro'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  preferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '@/features/notifications/data/queries/preferences'
import { ContactMethods } from '@/features/notifications/settings/contact-methods'
import { PreferenceCard } from '@/features/notifications/settings/preference-card'
import { RegistrationMobileCtaBar } from '@/features/notifications/settings/registration-mobile-cta-bar'

interface NotificationSettingsProps {
  onConfirm: () => void
  onSkip: () => void
}

export const NotificationSettings = ({
  onConfirm,
  onSkip,
}: NotificationSettingsProps) => {
  const { t } = useLingui()

  const preferences = useQuery({
    ...preferencesQueryOptions,
  })

  const updatePreferencesMutation = useMutation({
    ...updatePreferenceMutationOptions,
    onSuccess: () => {
      toast.success(t`Preferences updated`)
    },
    onError: (error: Error) => {
      toast.error(error.message || t`Failed to update preferences`)
    },
  })

  const form = useForm({
    defaultValues: {
      // Name Expiry defaults to enabled — it's the recommended preference.
      ownedNameExpiry: preferences.data?.settings?.ownedNameExpiry ?? true,
      ensLabsUpdates: preferences.data?.settings?.ensLabsUpdates ?? false,
      favouritedNameExpiry:
        preferences.data?.settings?.favouritedNameExpiry ?? false,
    },
    onSubmit: async ({ formApi, value }) => {
      await updatePreferencesMutation.mutateAsync(value)

      await preferences.refetch()

      formApi.reset()
      onConfirm()
    },
  })

  const hasVerifiedChannels =
    (preferences.data?.verifiedChannels?.length ?? 0) > 0

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-8 max-md:pb-[max(7.5rem,calc(env(safe-area-inset-bottom,0px)+6.5rem))] lg:my-5">
      {/* Title section */}
      <div className="flex flex-col gap-4 pb-6">
        <h1 className="font-normal font-sans text-[#232222] text-[28px] leading-ens-none tracking-[0.01em]">
          <Trans>Never lose your name to expiry.</Trans>
        </h1>
        <div className="text-base text-slate-600 leading-ens-normal">
          <p>
            <Trans>You'll always see important notifications in the app.</Trans>
          </p>
          <p>
            <Trans>
              Add an external contact method if you also want reminders by email
              or Telegram or in your browser.
            </Trans>
          </p>
        </div>
      </div>

      {/* Two-column grid: Contact methods (3fr) + Preferences (2fr). Same stack
          order on mobile: contact methods first, then preferences. */}
      <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[3fr_2fr]">
        {/* Contact methods column: card + CTAs stay with this section (moves with collapsible). */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
            <ContactMethods />
          </div>
          <RegistrationMobileCtaBar>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  className="uppercase tracking-[0.12em] max-md:min-h-12 max-md:flex-1 max-md:basis-0 max-md:rounded-xl max-md:py-3.5"
                  disabled={!canSubmit || !hasVerifiedChannels || isSubmitting}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    form.handleSubmit()
                  }}
                  size="lg"
                  variant="lightBlue"
                >
                  {isSubmitting ? (
                    <Trans>Saving...</Trans>
                  ) : (
                    <Trans>Save and Continue</Trans>
                  )}
                </Button>
              )}
            </form.Subscribe>
            <Button
              className="uppercase tracking-[0.12em] max-md:min-h-12 max-md:shrink-0 max-md:rounded-xl max-md:px-4 max-md:py-3 max-md:font-mono max-md:text-ens-blue-dark max-md:text-xs max-md:shadow-none max-md:active:bg-ens-blue-light/60 max-md:hover:bg-ens-blue-light/40 md:bg-[#dbf0f8] md:text-ens-lapis-500 md:active:bg-[#a9d5ed] md:hover:bg-[#c4e7f3]"
              onClick={onSkip}
              size="lg"
              variant="ghost"
            >
              <Trans>Set up later</Trans>
            </Button>
          </RegistrationMobileCtaBar>
        </div>

        {/* Preferences card */}
        <div className="flex flex-col gap-2 rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-2">
            <h2 className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
              <Trans>Preferences</Trans>
            </h2>
            <p className="text-ens-quartz-400 text-sm italic leading-ens-normal">
              <Trans>In-app notifications are always enabled</Trans>
            </p>
          </div>

          <form.Field name="ownedNameExpiry">
            {(field) => (
              <PreferenceCard
                checked={field.state.value}
                description={t`You'll be notified 30, 7, and 1 day before expiry.`}
                disabled={preferences.isRefetching}
                icon={<MSymbol className="ms-wght-300" symbol="schedule" />}
                isLoading={preferences.isLoading}
                label={t`Name Expiry`}
                onChange={(checked) => field.handleChange(checked)}
                recommended
              />
            )}
          </form.Field>
          <form.Field name="ensLabsUpdates">
            {(field) => (
              <PreferenceCard
                checked={field.state.value}
                description={t`Get updated on the latest releases and features.`}
                disabled={preferences.isRefetching}
                icon={<EnsMobileIcon />}
                isLoading={preferences.isLoading}
                label={t`ENS Labs Updates`}
                onChange={(checked) => field.handleChange(checked)}
              />
            )}
          </form.Field>
          <form.Field name="favouritedNameExpiry">
            {(field) => (
              <PreferenceCard
                checked={field.state.value}
                description={t`Get notified when names you favorited expire.`}
                disabled={preferences.isRefetching}
                icon={<MSymbol className="ms-wght-300" symbol="favorite" />}
                isLoading={preferences.isLoading}
                label={t`Favourites`}
                onChange={(checked) => field.handleChange(checked)}
              />
            )}
          </form.Field>
        </div>
      </div>
    </div>
  )
}
