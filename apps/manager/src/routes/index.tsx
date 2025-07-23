import { createFileRoute } from '@tanstack/react-router'
import { CheckNameAvailabilityPage } from '@/features/register/pages/CheckNameAvailabilityPage'

function IndexPage() {
  return <CheckNameAvailabilityPage />
}

export const Route = createFileRoute('/')({
  component: IndexPage,
})
