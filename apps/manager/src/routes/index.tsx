import { createFileRoute } from '@tanstack/react-router'
import { CheckDomainPage } from '@/features/register/pages/CheckDomainPage'

function IndexPage() {
  return <CheckDomainPage />
}

export const Route = createFileRoute('/')({
  component: IndexPage,
})
