import { createFileRoute } from '@tanstack/react-router'
import { AiPage } from '@/features/ai/AiPage'
import { RequireBackendAuth } from '@/features/notifications/RequireBackendAuth'

export const Route = createFileRoute('/ai')({
  ssr: false,
  component: () => (
    <RequireBackendAuth>
      <AiPage />
    </RequireBackendAuth>
  ),
})
