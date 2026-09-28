import type { UserNotificationSettings } from '@ens-apps/shared-schema/notifications'
import { Trans, useLingui } from '@lingui/react/macro'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  getPreferenceChannelsQueryOptions,
  getPreferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '@/features/notifications/data/queries/preferences'
import { PreferenceCard } from '@/features/notifications/settings/preference-card'
import {
  getPreferenceSession,
  subscribePreferenceSession,
} from '../services/preferenceSession'
import {
  getPreferenceProposalValues,
  type PreferenceProposal,
} from './preferenceProposal'

export type UseNotificationPreferencesFormOptions = {
  /**
   * When the API has no value yet, default Name Expiry on (registration) vs off
   * (notification settings page).
   */
  nameExpiryDefaultWhenUnset?: boolean
  /** Called after a successful save + refetch + form reset (e.g. registration continue). */
  onPersistSuccess?: () => void
  proposedPreference?: PreferenceProposal
  proposalSessionId?: string
}

export const useNotificationPreferencesForm = ({
  nameExpiryDefaultWhenUnset = false,
  onPersistSuccess,
  proposedPreference,
  proposalSessionId,
}: UseNotificationPreferencesFormOptions) => {
  const { t } = useLingui()
  const session = useSyncExternalStore(
    subscribePreferenceSession,
    getPreferenceSession,
    getPreferenceSession,
  )
  const [draft, setDraft] = useState<{
    sessionId: string
    baseline: UserNotificationSettings
  } | null>(null)

  const preferences = useQuery({
    ...getPreferencesQueryOptions(session),
  })

  const verifiedChannels = useQuery({
    ...getPreferenceChannelsQueryOptions(session),
    select: (data) => data.filter((c) => c.status === 'verified'),
  })

  const updatePreferencesMutation = useMutation({
    ...updatePreferenceMutationOptions,
  })

  const form = useForm({
    defaultValues:
      draft?.sessionId === session.id
        ? draft.baseline
        : {
            ownedNameExpiry: nameExpiryDefaultWhenUnset,
            ensLabsUpdates: false,
            favouritedNameExpiry: false,
          },
    // TanStack captures submit metadata before asynchronous validation. A later
    // render cannot replace this submission's session or original baseline.
    onSubmitMeta: { session, draft },
    onSubmit: async ({ formApi, value, meta }) => {
      try {
        meta.session.assertCurrent()
        if (!meta.draft || meta.draft.sessionId !== meta.session.id)
          throw new Error(
            'Wait for your current notification settings to load.',
          )
        const result = await updatePreferencesMutation.mutateAsync({
          session: meta.session,
          baseline: meta.draft.baseline,
          values: value,
        })
        meta.session.assertCurrent()
        setDraft({ sessionId: meta.session.id, baseline: result.settings })
        formApi.reset(result.settings)
        toast.success(t`Preferences updated`)
        onPersistSuccess?.()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t`Failed to update preferences`,
        )
      }
    },
  })

  useEffect(() => {
    if (
      !preferences.isSuccess ||
      preferences.isFetching ||
      draft?.sessionId === session.id ||
      getPreferenceSession().id !== session.id
    )
      return
    const baseline = preferences.data.settings
    form.reset(baseline)
    const proposed = getPreferenceProposalValues(
      baseline,
      proposedPreference,
      proposalSessionId,
      session.id,
    )
    if (proposedPreference && proposalSessionId === session.id)
      form.setFieldValue(
        proposedPreference.key,
        proposed[proposedPreference.key],
      )
    setDraft({ sessionId: session.id, baseline })
  }, [
    draft?.sessionId,
    form,
    preferences.data,
    preferences.isFetching,
    preferences.isSuccess,
    proposalSessionId,
    proposedPreference,
    session,
  ])

  const isReady =
    draft?.sessionId === session.id &&
    preferences.isSuccess &&
    !preferences.isFetching
  const hasVerifiedChannels =
    isReady &&
    verifiedChannels.isSuccess &&
    !verifiedChannels.isFetching &&
    verifiedChannels.data.length > 0

  return {
    form,
    preferences,
    hasVerifiedChannels,
    isReady,
    staleProposal: !!proposedPreference && proposalSessionId !== session.id,
  }
}

type NotificationPreferencesFieldsProps = Pick<
  ReturnType<typeof useNotificationPreferencesForm>,
  'form' | 'preferences'
>

export const NotificationPreferencesFields = ({
  form,
  preferences,
}: NotificationPreferencesFieldsProps) => {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-2">
        <h2 className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
          <Trans>Preferences</Trans>
        </h2>
        <p className="text-ens-quartz-400 text-sm italic leading-ens-normal">
          <Trans>In-app notifications are always enabled</Trans>
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <form.Field name="ownedNameExpiry">
          {(field) => (
            <PreferenceCard
              checked={field.state.value}
              description={
                <Trans>
                  Get notified as owned names approach expiry and move through
                  their grace period.
                </Trans>
              }
              disabled={preferences.isFetching || !preferences.isSuccess}
              icon={<MSymbol className="ms-wght-300" symbol="schedule" />}
              isLoading={preferences.isLoading}
              label={<Trans>Name Expiry</Trans>}
              onChange={(checked) => field.handleChange(checked)}
              recommended
            />
          )}
        </form.Field>
        <form.Field name="ensLabsUpdates">
          {(field) => (
            <PreferenceCard
              checked={field.state.value}
              description={
                <Trans>Get updated on the latest releases and features.</Trans>
              }
              disabled={preferences.isFetching || !preferences.isSuccess}
              icon={<EnsMobileIcon />}
              isLoading={preferences.isLoading}
              label={<Trans>ENS Labs Updates</Trans>}
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="favouritedNameExpiry">
          {(field) => (
            <PreferenceCard
              checked={field.state.value}
              description={
                <Trans>
                  Get notified as favourited names approach expiry and move
                  through their grace period.
                </Trans>
              }
              disabled={preferences.isFetching || !preferences.isSuccess}
              icon={<MSymbol className="ms-wght-300" symbol="favorite" />}
              isLoading={preferences.isLoading}
              label={<Trans>Favourites</Trans>}
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
      </div>
    </>
  )
}

export const NotificationPreferences = ({
  proposedPreference,
  proposalSessionId,
}: {
  readonly proposedPreference?: UseNotificationPreferencesFormOptions['proposedPreference']
  readonly proposalSessionId?: string
}) => {
  const { form, preferences, hasVerifiedChannels, staleProposal } =
    useNotificationPreferencesForm({
      nameExpiryDefaultWhenUnset: false,
      proposedPreference,
      proposalSessionId,
    })

  return (
    <div className="flex flex-col gap-6">
      {staleProposal && (
        <p role="status">
          <Trans>
            Your sign-in changed. The earlier notification request was
            discarded. Review your current settings below.
          </Trans>
        </p>
      )}
      {preferences.isError && (
        <p role="alert">
          <Trans>
            Your notification preferences could not be loaded. Please try again.
          </Trans>
        </p>
      )}
      <div className="flex flex-col gap-4 rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
        <NotificationPreferencesFields form={form} preferences={preferences} />
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
              disabled={
                !canSubmit ||
                isSubmitting ||
                !hasVerifiedChannels ||
                isDefaultValue
              }
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
