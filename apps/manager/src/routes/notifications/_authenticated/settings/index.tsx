import { createFileRoute } from '@tanstack/react-router'
import { ContactMethods } from '@/features/notifications/settings/contact-methods'
import { NotificationPreferences } from '@/features/notifications/settings/preferences'

// Exported so Storybook stories can import the component without mounting
// the full router. Keep colocated with the route definition.
export const NotificationSettingsPage = () => {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 rounded-lg border-[#dededf] bg-white px-8 py-8 sm:px-6 lg:my-5 lg:border">
      <div className="flex flex-col gap-4">
        <h1 className="font-[350] text-[#232222] text-temp-32px leading-ens-none">
          Notification Settings
        </h1>

        <p className="text-[#717182] text-base">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
      </div>

      <ContactMethods />

      <NotificationPreferences />
    </div>
  )
}

export const Route = createFileRoute('/notifications/_authenticated/settings/')(
  {
    component: NotificationSettingsPage,
  },
)
