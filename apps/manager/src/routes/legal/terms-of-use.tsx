import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/terms-of-use')({
  beforeLoad: () => {
    throw redirect({ href: 'https://ens.domains/legal/terms-of-use' })
  },
})
