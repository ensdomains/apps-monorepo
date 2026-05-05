import { Trans } from '@lingui/react/macro'
import { useSelector as useStoreSelector } from '@xstate/store-react'
import { Button } from '@/components/ui/button'
import { ContactMethods } from '@/features/notifications/settings/contact-methods'
import {
  NotificationPreferencesFields,
  useNotificationPreferencesForm,
} from '@/features/notifications/settings/preferences'
import { backendAuthStore, isBackendAuthed } from '@/utils/backend-client'

export interface NotificationSettingsProps {
  onConfirm: () => void
  onSkip: () => void
}

export const NotificationSettingsStep = ({
  onConfirm,
  onSkip,
}: NotificationSettingsProps) => {
  const isAuthed = useStoreSelector(isBackendAuthed)

  const { form, preferences, hasVerifiedChannels } =
    useNotificationPreferencesForm({
      preferencesQueryEnabled: isAuthed,
      nameExpiryDefaultWhenUnset: true,
      onPersistSuccess: onConfirm,
    })

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-8 lg:my-5">
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

      {isAuthed ? (
        <>
          {/* Two-column grid: Contact methods (3fr) + Preferences (2fr).
              On mobile (single column) the order is flipped via `order-*` so
              Preferences shows above Contact methods, matching the mobile mock. */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]">
            {/* Contact methods card */}
            <div className="order-2 rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)] md:order-1">
              <ContactMethods />
            </div>

            {/* Preferences card — same fields as notification settings `NotificationPreferences` */}
            <div className="order-1 flex flex-col gap-4 rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)] md:order-2">
              <NotificationPreferencesFields
                form={form}
                preferences={preferences}
              />
            </div>
          </div>

          {/* Bottom action buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  className="uppercase tracking-[0.12em]"
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
              className="bg-[#dbf0f8] text-ens-lapis-500 uppercase tracking-[0.12em] hover:bg-[#c4e7f3] active:bg-[#a9d5ed]"
              onClick={onSkip}
              size="lg"
              variant="lightBlue"
            >
              <Trans>Set up later</Trans>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
          <p className="text-base text-slate-600 leading-ens-normal">
            <Trans>
              You need to verify your wallet ownership to manage your
              notification preferences.
            </Trans>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              className="uppercase tracking-[0.12em]"
              onClick={() => {
                backendAuthStore.trigger.resetModal()
              }}
              size="lg"
              variant="lightBlue"
            >
              <Trans>Verify Wallet</Trans>
            </Button>
            <Button
              className="bg-[#dbf0f8] text-ens-lapis-500 uppercase tracking-[0.12em] hover:bg-[#c4e7f3] active:bg-[#a9d5ed]"
              onClick={onSkip}
              size="lg"
              variant="lightBlue"
            >
              <Trans>Set up later</Trans>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
