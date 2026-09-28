import { createFileRoute } from '@tanstack/react-router'
import { AiPage } from '@/features/ai/AiPage'
import { RequireBackendAuth } from '@/features/notifications/RequireBackendAuth'

export const Route = createFileRoute('/ai')({
  ssr: false,
  component: () => (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <RequireBackendAuth>
        <AiPage />
      </RequireBackendAuth>
    </div>
  ),
})
