import { Trans, useLingui } from '@lingui/react/macro'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import {
  preferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '@/features/notifications/data/queries/preferences'

export const Preference = ({
  icon,
  label,
  description,
  checked,
  disabled,
  isLoading,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  isLoading?: boolean
  onChange: (checked: boolean) => void
}) => {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[#FAFAFB] p-5">
      {icon}
      <div className="flex flex-col gap-1.5">
        <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
          {label}
        </div>
        <div className="text-slate-600 text-sm">{description}</div>
      </div>
      {isLoading ? (
        <Loader2Icon className="ml-auto size-5 animate-spin" />
      ) : (
        <Switch
          checked={checked}
          className="ml-auto"
          disabled={disabled}
          onCheckedChange={onChange}
        />
      )}
    </div>
  )
}

export const NotificationPreferences = () => {
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
      ownedNameExpiry: preferences.data?.settings?.ownedNameExpiry ?? false,
      ensLabsUpdates: preferences.data?.settings?.ensLabsUpdates ?? false,
      favouritedNameExpiry:
        preferences.data?.settings?.favouritedNameExpiry ?? false,
    },
    onSubmit: async ({ formApi, value }) => {
      await updatePreferencesMutation.mutateAsync(value)

      await preferences.refetch()

      formApi.reset()
    },
  })

  const hasVerifiedChannels =
    (preferences.data?.verifiedChannels?.length ?? 0) > 0

  if (!hasVerifiedChannels) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-medium font-sans text-[#232222] text-base leading-ens-none">
        <Trans>Notification Preferences</Trans>
      </h2>
      <div className="flex flex-col gap-3">
        <form.Field name="ownedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description={t`You'll be notified 30, 7, and 1 day before expiry`}
              disabled={preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="schedule"
                />
              }
              isLoading={preferences.isLoading}
              label={t`Name Expiry`}
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="ensLabsUpdates">
          {(field) => (
            <Preference
              checked={field.state.value}
              description={t`Get updated on the latest releases and features`}
              disabled={preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="search"
                />
              }
              isLoading={preferences.isLoading}
              label={t`ENS Labs Updates`}
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="favouritedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description={t`Get notified when names in your favourites expire`}
              disabled={preferences.isRefetching}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="favorite"
                />
              }
              isLoading={preferences.isLoading}
              label={t`Favourited Name Expiry`}
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
      </div>
      <div className="ml-auto w-full max-w-md">
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
              {isSubmitting ? (
                <Trans>Saving...</Trans>
              ) : (
                <Trans>Save Preferences</Trans>
              )}
            </Button>
          )}
        </form.Subscribe>
        {!hasVerifiedChannels && (
          <p className="mt-2 text-base text-slate-600 leading-ens-normal">
            <Trans>
              Verify at least one contact method to save preferences
            </Trans>
          </p>
        )}
      </div>
    </div>
  )
}
