import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { getMigrationHcaApprovalQueryOptions } from '@/features/migration/service/migrationApprovalQueries'
import { useSmartAccountContext } from '@/lib/smart-account'

export const TemporaryMigrationAccessNotice = () => {
  const { ownerAddress, accountAddress } = useSmartAccountContext()
  const publicClient = usePublicClient()
  const owner = ownerAddress as Address | undefined
  const hca = accountAddress as Address | undefined
  const { data: isApproved } = useQuery(
    getMigrationHcaApprovalQueryOptions({ owner, hca, publicClient }),
  )

  if (!isApproved) return null

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-xl border border-ens-garnet-200 bg-ens-garnet-50 px-4 py-4 text-ens-garnet-900 sm:flex-row sm:items-center sm:justify-between md:px-6"
      role="status"
    >
      <p className="text-sm">
        <Trans>
          Temporary migration access is still active for your smart account.
        </Trans>
      </p>
      <Link
        className="w-fit shrink-0 rounded-full border border-ens-garnet-900/20 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/60"
        to="/migration-permissions"
      >
        <Trans>Review permissions</Trans>
      </Link>
    </div>
  )
}
