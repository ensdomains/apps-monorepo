import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { MigrationPermissionsPage } from '@/features/migration/pages/MigrationPermissionsPage'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/migration-permissions')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const { hasInitialized, isLoading, ownerAddress, accountAddress } =
    useSmartAccountContext()
  const { isConnecting, isReconnecting } = useConnection()

  useOnDisconnected(() => {
    navigate({ to: '/', replace: true })
  })

  if (
    isLoading ||
    !hasInitialized ||
    isConnecting ||
    isReconnecting ||
    !ownerAddress ||
    !accountAddress
  ) {
    return <DashboardLoading />
  }

  return <MigrationPermissionsPage />
}
