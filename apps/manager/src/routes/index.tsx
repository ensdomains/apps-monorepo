import { createFileRoute } from '@tanstack/react-router'
import { CheckNamePage } from '@/features/register/pages/CheckNamePage'

function IndexPage() {
  return <CheckNamePage />
}

export const Route = createFileRoute('/')({
  component: IndexPage,
})
