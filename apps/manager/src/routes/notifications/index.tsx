import { createFileRoute } from '@tanstack/react-router'
import { NotificationsDropdown } from '@/features/notifications/components'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="m-5 max-w-sm rounded-md border border-gray-400">
      <NotificationsDropdown />
    </div>
  )
}
