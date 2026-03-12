import { Trans } from '@lingui/react/macro'

export const DashboardLoading = () => {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">
          <Trans>Loading dashboard...</Trans>
        </div>
      </div>
    </div>
  )
}
