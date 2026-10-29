import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import type { ClassifiedName } from '@/features/migration/service/classifyNames'
import { resolveMigratableNames } from '@/features/migration/service/migratableNames'
import { runEligibilityChecks } from '@/features/migration/service/preflightChecks'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { publicClient } from '@/lib/wagmi'

export type {
  BlockedSubnameMigration,
  SubnameMigrationBlockReason,
} from '@/features/migration/service/migratableNames'

const ELIGIBILITY_STALE_MS = 60_000

export const useMigrationEligibility = (
  names: readonly ClassifiedName[],
  ownerAddress?: string | null,
) => {
  const isSubnameImportEnabled =
    useFeatureFlagEnabled(
      POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
      false,
    ) === true
  return useQuery({
    queryKey: qk('migration', 'eligibility', {
      owner: ownerAddress?.toLowerCase(),
      isSubnameImportEnabled,
      names: names.map((name) => ({
        id: name.domain.id,
        action: name.action,
        tokenType: name.tokenType,
        owner: name.tokenHolder,
        fuses: name.fuses.toString(),
        resolver: name.v1ResolverAddress,
        registrationExpiry: name.domain.registration?.expiryDate,
        wrappedExpiry: name.domain.wrappedDomain?.expiryDate,
      })),
    }),
    queryFn: async ({ signal }) => {
      const client = publicClient as PublicClient
      const owner = ownerAddress as Address
      const result = await runEligibilityChecks(client, [...names], owner)
      signal.throwIfAborted()
      return {
        ...result,
        ...(await resolveMigratableNames({
          eligible: result.eligible,
          isSubnameImportEnabled,
          owner,
          publicClient: client,
          signal,
        })),
      }
    },
    enabled: !!ownerAddress && names.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

/**
 * The upgrade's subname check for names in grace, as they will read once
 * renewed. Skips the live ownership and reservation reads: the renewal
 * restores the reservation, and the upgrade page reads neither before it.
 */
export const useGraceRenewalEligibility = (
  renewedNames: readonly ClassifiedName[],
  ownerAddress?: string | null,
) => {
  const isSubnameImportEnabled =
    useFeatureFlagEnabled(
      POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
      false,
    ) === true
  return useQuery({
    queryKey: qk('migration', 'grace-renewal-eligibility', {
      owner: ownerAddress?.toLowerCase(),
      isSubnameImportEnabled,
      names: renewedNames.map((name) => ({
        id: name.domain.id,
        action: name.action,
        tokenType: name.tokenType,
        fuses: name.fuses.toString(),
        resolver: name.v1ResolverAddress,
      })),
    }),
    queryFn: ({ signal }) =>
      resolveMigratableNames({
        eligible: renewedNames,
        isSubnameImportEnabled,
        owner: ownerAddress as Address,
        publicClient: publicClient as PublicClient,
        signal,
      }),
    enabled: !!ownerAddress && renewedNames.length > 0,
    staleTime: ELIGIBILITY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
