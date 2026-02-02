import { createFileRoute } from '@tanstack/react-router'
import { ContactMethods } from '@/features/notifications/components/settings/contact-methods'
import { NotificationPreferences } from '@/features/notifications/components/settings/preferences'

export const Route = createFileRoute('/notifications/settings/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-12 rounded-lg border-[#dededf] bg-white px-6 py-8 lg:my-5 lg:border">
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

      <NotificationPreferences />
    </div>
  )
}
