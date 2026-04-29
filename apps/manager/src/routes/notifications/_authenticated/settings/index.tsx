import { createFileRoute } from '@tanstack/react-router'
import { NotificationSettingsPage } from '@/features/notifications/pages/notification-settings-page'

export const Route = createFileRoute('/notifications/_authenticated/settings/')(
  {
    component: NotificationSettingsPage,
  },
)
