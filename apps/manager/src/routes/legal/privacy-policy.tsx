import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/privacy-policy')({
  beforeLoad: () => {
    throw redirect({ href: 'https://ens.domains/legal/privacy-policy' })
  },
})
