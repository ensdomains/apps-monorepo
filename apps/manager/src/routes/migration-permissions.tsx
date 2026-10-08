import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/migration-permissions')({
  beforeLoad: () => {
    throw redirect({ to: '/upgrade-permissions', replace: true })
  },
})
