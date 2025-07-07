import { createFileRoute } from '@tanstack/react-router'
import { AllNotifications } from '@/features/notifications/components'

export const Route = createFileRoute('/notifications/all')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-sm">
      <AllNotifications />
    </div>
  )
}
