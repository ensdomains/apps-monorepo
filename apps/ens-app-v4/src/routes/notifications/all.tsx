import { createFileRoute } from '@tanstack/react-router'
import { AllNotifications } from '@/features/notifications/components'
import { MOCK_NOTIFICATIONS } from '@/features/notifications/MOCK'

export const Route = createFileRoute('/notifications/all')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-sm">
      <AllNotifications notifications={MOCK_NOTIFICATIONS} />
    </div>
  )
}
