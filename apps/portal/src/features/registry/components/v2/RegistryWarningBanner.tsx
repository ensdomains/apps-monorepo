import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getIsUntrustedRegistryQueryOptions } from '@/features/registry/hooks/useIsUntrustedRegistry'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import {
  selectRegistryWarning,
  toRegistryCheck,
} from '@/features/registry/utils/registryWarning'
import { UntrustedRegistryAlert } from './UntrustedRegistryWarning'

/** PostHog flag that turns on the affected-registry warning (WEB-2178). */
const AFFECTED_REGISTRY_WARNING_FLAG = 'affected-registry-warning'

/** The single warning at the top of every registry page, shown to every visitor. */
export const RegistryWarningBanner = ({
  address,
}: {
  readonly address: Address
}) => {
  // Off until owners have had time to move off the affected implementation; an unset or unloaded flag counts as off.
  const isAffectedWarningOn =
    useFeatureFlagEnabled(AFFECTED_REGISTRY_WARNING_FLAG) === true
  const untrustedQuery = useQuery(
    getIsUntrustedRegistryQueryOptions({ address }),
  )
  const affectedQuery = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({ registryAddress: address }),
    enabled: isAffectedWarningOn,
  })

  return match(
    selectRegistryWarning({
      untrusted: toRegistryCheck(untrustedQuery),
      affected: toRegistryCheck(affectedQuery),
      isAffectedWarningOn,
    }),
  )
    .with('untrusted', () => (
      <UntrustedRegistryAlert address={address}>
        If a name of yours uses it, keep the roles that let you change that
        name's registry, so you can move it to a new one.
      </UntrustedRegistryAlert>
    ))
    .with('affected', () => (
      <Alert className="p-5 gap-2" variant="warning">
        <TriangleAlert className="size-4" />
        <AlertTitle>Avoid using this registry in production</AlertTitle>
        <AlertDescription>
          This registry uses an affected version that can behave unexpectedly.
          If you wish to create subnames, deploy to a new registry.
        </AlertDescription>
      </Alert>
    ))
    .with(null, () => null)
    .exhaustive()
}
