import { createFileRoute } from '@tanstack/react-router'
import { AllNotificationsPage } from '@/features/notifications/pages/all-notifications-page'

export const Route = createFileRoute('/notifications/_authenticated/')({
  component: AllNotificationsPage,
})
