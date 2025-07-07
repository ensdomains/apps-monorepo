import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { NotificationSettings } from '@/features/notifications/components/settings'
import { generateRandomNotification } from '@/features/notifications/MOCK'
import { notificationsStore } from '@/features/notifications/stores/notifications'

export const Route = createFileRoute('/notifications/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-sm">
      <NotificationSettings />

      <Button
        className="mt-5 w-full"
        onClick={() => {
          generateRandomNotification().then((notification) => {
            notificationsStore.trigger.addNotification({
              notification,
              sorted: true,
            })

            console.log('Added notification', notification)
          })
        }}
      >
        Add random notification
      </Button>
    </div>
  )
}
