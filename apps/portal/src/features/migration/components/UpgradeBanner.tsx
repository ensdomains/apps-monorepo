import { useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { usePublicClient } from 'wagmi'
import { Alert } from '@/components/ui/alert'
import { envConfig } from '@/config'
import { UpgradeActions } from '@/features/migration/components/UpgradeActions'
import { getSubnameImpactPreviewQueryOptions } from '@/features/migration/hooks/subnameImpactPreview.query'
import { MANAGER_UPGRADE_URL } from '@/lib/constants/domain'

type SubnameImpact =
  | { readonly status: 'pending' | 'error' }
  | { readonly status: 'ready'; readonly affectedCount: number }

/** The banner copy: the subname impact replaces the base sentence once it is known. */
export const describeUpgrade = ({
  isWrapped,
  impact,
}: {
  readonly isWrapped: boolean
  readonly impact: SubnameImpact
}): string => {
  if (impact.status === 'ready' && impact.affectedCount > 0) {
    const subnames =
      impact.affectedCount === 1
        ? '1 subname'
        : `${impact.affectedCount} subnames`
    return `This name is reserved on ENS v2 until it is migrated from ENS v1. Upgrading this name on its own would delete ${subnames}. Review which subnames will be carried over in Manager before continuing.`
  }
  const base = isWrapped
    ? 'This wrapped name must be unwrapped before it can be upgraded to ENS v2'
    : 'This name is reserved on ENS v2 until it is upgraded from ENS v1'
  if (impact.status === 'error') {
    return `${base}. Subname impact could not be checked here. Review it in Manager before upgrading.`
  }
  return base
}

/**
 * Prompts the connected owner of a migratable v1 name to upgrade it to ENSv2 in
 * the Manager app. Rendered only when the name is migratable and the owner
 * wallet is connected (gated by the caller). `isWrapped` marks an unlocked
 * NameWrapper token, which is unwrapped as part of the upgrade.
 */
export const UpgradeBanner = ({
  name,
  isWrapped = false,
}: {
  readonly name: string
  readonly isWrapped?: boolean
}) => {
  const publicClient = usePublicClient({ chainId: envConfig.chain.id })
  const impactQuery = useQuery({
    ...getSubnameImpactPreviewQueryOptions({ name, publicClient }),
    enabled: !!publicClient && !!MANAGER_UPGRADE_URL,
  })
  const impact = match(impactQuery)
    .returnType<SubnameImpact>()
    .with({ isError: true }, () => ({ status: 'error' }))
    .with({ data: P.nonNullable }, ({ data }) => ({
      status: 'ready',
      affectedCount: data.affectedCount,
    }))
    .otherwise(() => ({ status: 'pending' }))

  // Sized by the banner's own width, not the viewport: the sidebar decides how
  // much room the long copy has beside the title and actions.
  return (
    <div className="@container/upgrade-banner">
      <Alert
        variant="default"
        className="flex flex-col gap-3 p-5 @7xl/upgrade-banner:flex-row @7xl/upgrade-banner:items-center @7xl/upgrade-banner:gap-10"
      >
        <div className="flex shrink-0 items-start gap-4 flex-col sm:flex-row sm:items-center">
          <CircleAlert className="size-6 shrink-0" />
          <p className="whitespace-nowrap text-3xl font-normal leading-none tracking-[-0.02em] font-serif">
            Upgrade to ENSv2
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4 @7xl/upgrade-banner:flex-row @7xl/upgrade-banner:items-center @7xl/upgrade-banner:gap-10">
          <p className="min-w-0 text-p">
            {describeUpgrade({ isWrapped, impact })}
          </p>
          <UpgradeActions name={name} isWrapped={isWrapped} />
        </div>
      </Alert>
    </div>
  )
}
