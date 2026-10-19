import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/trademark-guidelines')({
  beforeLoad: () => {
    throw redirect({
      href: 'https://ens.domains/legal/trademark-guidelines',
      replace: true,
    })
  },
})
