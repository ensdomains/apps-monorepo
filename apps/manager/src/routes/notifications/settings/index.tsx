import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  NotificationPreferences,
  NotificationSettings,
} from '@/features/notifications/components'

export const Route = createFileRoute('/notifications/settings/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-semibold text-3xl">Notification Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your notification preferences for ENS name events and updates.
        </p>
      </div>

      <Tabs defaultValue="channels" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-6">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="preferences" className="mt-6">
          <NotificationPreferences />
        </TabsContent>

        <TabsContent value="advanced" className="mt-6">
          <div className="py-8 text-center text-muted-foreground">
            Advanced settings coming soon...
          </div>
        </TabsContent>
      </Tabs>

      <Outlet />
    </div>
  )
}
