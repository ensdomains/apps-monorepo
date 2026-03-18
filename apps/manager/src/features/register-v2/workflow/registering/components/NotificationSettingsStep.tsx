import { useSelector as useStoreSelector } from '@xstate/store-react'
import { Button } from '@/components/ui/button'
import { ContactMethods } from '@/features/notifications/settings/contact-methods'
import { backendAuthStore, isBackendAuthed } from '@/utils/backend-client'
import {
  NotificationPreferencesForm,
  type NotificationSettingsProps,
} from './NotificationPreferencesForm'

export const NotificationSettingsStep = ({
  onConfirm,
  onSkip,
}: NotificationSettingsProps) => {
  const isAuthed = useStoreSelector(isBackendAuthed)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 rounded-lg border-[#dededf] md:bg-white md:px-6 md:py-8 lg:my-5 lg:border">
      <div className="flex flex-col gap-4">
        <h1 className="font-[350] font-serif text-[#232222] text-temp-32px leading-ens-none">
          Notification Settings
        </h1>

        <p className="text-[#717182] text-base">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
        {!isAuthed && (
          <>
            <p>
              You need to verify your wallet ownership to manage your
              notification preferences.
            </p>
            <div className="flex w-full gap-2 max-md:flex-col md:justify-end">
              <Button
                className="flex-1 uppercase md:min-w-32"
                onClick={onSkip}
                size="xl"
                variant="outline"
              >
                Skip
              </Button>
              <Button
                className="flex-1 uppercase"
                onClick={() => {
                  backendAuthStore.trigger.resetModal()
                }}
                size="xl"
                variant="lightBlue"
              >
                Verify Wallet
              </Button>
            </div>
          </>
        )}
      </div>
      {isAuthed && (
        <>
          <ContactMethods />
          <NotificationPreferencesForm onConfirm={onConfirm} onSkip={onSkip} />
        </>
      )}
    </div>
  )
}
