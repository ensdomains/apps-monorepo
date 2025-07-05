import { createFileRoute } from '@tanstack/react-router'
import { NotificationSettings } from '@/features/notifications/components/settings'

export const Route = createFileRoute('/notifications/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-sm my-5 mx-auto">
      <NotificationSettings />
    </div>
  )
}
