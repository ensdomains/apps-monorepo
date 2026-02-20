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
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { ContactMethods } from '@/features/notifications/components/settings/contact-methods'
import { Preference } from '@/features/notifications/components/settings/preferences'
import {
  preferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '@/features/notifications/queries/preferences'

interface NotificationSettingsProps {
  onConfirm: () => void
  onSkip: () => void
}

const NotificationPreferences = ({
  onConfirm,
  onSkip,
}: NotificationSettingsProps) => {
  const preferences = useQuery({
    ...preferencesQueryOptions,
  })

  const updatePreferencesMutation = useMutation({
    ...updatePreferenceMutationOptions,
    onSuccess: () => {
      toast.success('Preferences updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update preferences')
    },
  })

  const form = useForm({
    defaultValues: {
      ownedNameExpiry: preferences.data?.settings?.ownedNameExpiry ?? false,
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
    <div className="flex flex-col gap-6">
      <h2 className="font-medium font-sans text-[#232222] text-base leading-ens-none">
        Notification Preferences
      </h2>
      <div className="flex flex-col gap-3">
        <form.Field name="ownedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="You'll be notified 30, 7, and 1 day before expiry"
              disabled={!hasVerifiedChannels || preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="schedule"
                />
              }
              isLoading={preferences.isLoading}
              label="Name Expiry"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="ensLabsUpdates">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="Get updated on the latest releases and features"
              disabled={!hasVerifiedChannels || preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="search"
                />
              }
              isLoading={preferences.isLoading}
              label="ENS Labs Updates"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="favouritedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="Get notified when names in your favourites expire"
              disabled={!hasVerifiedChannels || preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="favorite"
                />
              }
              isLoading={preferences.isLoading}
              label="Favourited Name Expiry"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
      </div>
      <div className="flex w-full gap-2 max-md:flex-col md:justify-end">
        <div>
          <Button
            className="w-full uppercase md:min-w-32"
            onClick={onSkip}
            size="xl"
            variant="ghost"
          >
            Skip
          </Button>
        </div>
        <div className="">
          <form.Subscribe
            selector={(state) => [
              state.canSubmit,
              state.isSubmitting,
              state.isDefaultValue,
            ]}
          >
            {([canSubmit, isSubmitting, isDefaultValue]) => (
              <Button
                className="w-full uppercase"
                disabled={!canSubmit || !hasVerifiedChannels || isDefaultValue}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  form.handleSubmit()
                }}
                size="xl"
                variant="lightBlue"
              >
                {isSubmitting ? 'Saving...' : 'Save Preferences'}
              </Button>
            )}
          </form.Subscribe>
          {!hasVerifiedChannels && (
            <p className="mt-2 text-base text-slate-600 leading-ens-normal">
              Verify at least one contact method to save preferences
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export const NotificationSettings = ({
  onConfirm,
  onSkip,
}: NotificationSettingsProps) => {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 rounded-lg border-[#dededf] bg-white px-6 py-8 lg:my-5 lg:border">
      {/* title row */}
      <div className="flex flex-col gap-4">
        {/* title */}
        <h1 className="font-[350] font-serif text-[#232222] text-temp-32px leading-ens-none">
          Notification Settings
        </h1>

        <p className="text-[#717182] text-base">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
      </div>

      <ContactMethods />

      <NotificationPreferences onConfirm={onConfirm} onSkip={onSkip} />
    </div>
  )
}
