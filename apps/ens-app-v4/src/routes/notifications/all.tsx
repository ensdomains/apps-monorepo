import { createFileRoute } from '@tanstack/react-router'
import { AllNotifications } from '@/features/notifications/components'
import { MOCK_NOTIFICATIONS } from '@/features/notifications/MOCK'

export const Route = createFileRoute('/notifications/all')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-sm my-5 mx-auto">
      <AllNotifications notifications={MOCK_NOTIFICATIONS} />
    </div>
  )
}
