import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import type { Address } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getIsUntrustedRegistryQueryOptions } from '@/features/registry/hooks/useIsUntrustedRegistry'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import { selectRegistryWarning } from '@/features/registry/utils/registryWarning'
import { UntrustedRegistryAlert } from './UntrustedRegistryWarning'

/** The single warning at the top of every registry page, shown to every visitor. */
export const RegistryWarningBanner = ({
  address,
}: {
  readonly address: Address
}) => {
  const { data: isUntrusted } = useQuery(
    getIsUntrustedRegistryQueryOptions({ address }),
  )
  const { data: isPendingUpgrade } = useQuery(
    getIsRegistryPendingUpgradeQueryOptions({ registryAddress: address }),
  )

  const warning = selectRegistryWarning({ isUntrusted, isPendingUpgrade })

  if (warning === 'untrusted')
    return (
      <UntrustedRegistryAlert address={address}>
        If a name of yours uses it, keep the roles that let you change that
        name's registry, so you can move it to a new one.
      </UntrustedRegistryAlert>
    )

  if (warning === 'affected')
    return (
      <Alert className="p-5 gap-2" variant="warning">
        <TriangleAlert className="size-4" />
        <AlertTitle>Avoid using this registry in production</AlertTitle>
        <AlertDescription>
          This registry uses an affected version that can behave unexpectedly.
          If you wish to create subnames, deploy to a new registry.
        </AlertDescription>
      </Alert>
    )

  return null
}
