import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'

function RouteComponent() {
  const isDashboardEnabled = useFeatureFlag('dashboard')
  const navigate = useNavigate()

  useEffect(() => {
    if (!isDashboardEnabled) {
      navigate({ to: '/' })
    }
  }, [isDashboardEnabled, navigate])

  if (!isDashboardEnabled) {
    return null
  }

  return <DashboardPage />
}

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})
