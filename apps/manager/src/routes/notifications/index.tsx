import { createFileRoute } from '@tanstack/react-router'
import { NotificationsDropdown } from '@/features/notifications/components'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-md">
      <NotificationsDropdown />
    </div>
  )
}
