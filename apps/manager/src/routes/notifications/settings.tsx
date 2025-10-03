import { createFileRoute } from '@tanstack/react-router'
// import { NotificationSettings } from '@/features/notifications/components/settings'

export const Route = createFileRoute('/notifications/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-2xl">
      {/* <NotificationSettings /> */}
    </div>
  )
}
