import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { normalizeDomainNameFromUrl } from '@/utils/domain'
import { isFeatureEnabled } from '@/utils/feature-flags'

type MigrationSearch = {
  readonly renew?: string
}

const MigrationRouteComponent = () => {
  const { renew } = Route.useSearch()
  return (
    <MigrationUiProvider>
      <MigrationPage initialRenewName={renew} />
    </MigrationUiProvider>
  )
}

export const Route = createFileRoute('/migration')({
  validateSearch: (search: Record<string, unknown>): MigrationSearch => {
    const rawRenew = typeof search.renew === 'string' ? search.renew : undefined
    const renew = rawRenew ? normalizeDomainNameFromUrl(rawRenew) : undefined
    return {
      renew: renew && renew !== '.eth' ? renew : undefined,
    }
  },
  component: MigrationRouteComponent,
  beforeLoad: () => {
    const connectedAddress = getConnectionCookie()

    if (!connectedAddress) throw redirect({ to: '/' })

    if (
      !isFeatureEnabled('MIGRATION', {
        walletAddress: connectedAddress,
      })
    ) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
