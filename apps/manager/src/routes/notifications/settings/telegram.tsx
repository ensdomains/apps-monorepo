import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MutationTester } from '@/features/debug/components'
import { loginWithTelegramPopup } from '@/features/notifications/telegram'

export const Route = createFileRoute('/notifications/settings/telegram')({
  component: RouteComponent,

  beforeLoad: (ctx) => {
    ctx.search
  },
})

function RouteComponent() {
  const telegramLogin = useMutation({
    mutationFn: loginWithTelegramPopup,
  })
  return (
    <div>
      <h1>Hello "/notifications/settings/telegram"!</h1>
      <MutationTester
        label="Telegram Login"
        mutation={telegramLogin}
        variables={() => ({
          botId: '8430077778',
          requestAccess: 'write' as const,
        })}
      />
    </div>
  )
}
