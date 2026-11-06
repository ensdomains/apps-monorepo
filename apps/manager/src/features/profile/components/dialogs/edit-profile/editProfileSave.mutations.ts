import { mutationOptions } from '@tanstack/react-query'
import {
  type SaveRecordsParams,
  saveRecords,
} from '@/features/profile/service/profileRecordTransactions'
import type { ResolverImport } from '@/features/profile/service/resolverImport'
import { setupControlledResolver } from '@/features/profile/service/setupControlledResolver'
import type { ProfileRecords } from '@/features/profile/types'
import { startAnalyticsOperation } from '@/lib/posthog/events'
import type { PendingSave } from './EditProfileDialog.machine'

interface SaveRecordsMutationVariables extends SaveRecordsParams {
  readonly currentRecords: ProfileRecords
}

interface SetupResolverMutationVariables {
  readonly pendingSave: Extract<PendingSave, { kind: 'setup' }>
}

export const getSaveRecordsMutationOptions = () =>
  mutationOptions({
    mutationFn: async ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsMutationVariables) => {
      const analytics = startAnalyticsOperation()
      const result = await saveRecords(params)
      analytics.capture('profile:records_update', { chain_id: params.chainId })
      return result
    },
  })

export const getSetupResolverMutationOptions = (
  resolverImport?: ResolverImport,
) =>
  mutationOptions({
    mutationFn: async ({ pendingSave }: SetupResolverMutationVariables) => {
      const analytics = startAnalyticsOperation()
      if (!pendingSave.recordReview)
        throw new Error(
          'Review the exact records before replacing the resolver.',
        )
      const resolver = await setupControlledResolver({
        name: pendingSave.name,
        signer: pendingSave.signer,
        ownerAddress: pendingSave.ownerAddress,
        publicClient: pendingSave.publicClient,
        chainId: pendingSave.chainId,
        before: pendingSave.before,
        after: pendingSave.after,
        description: `Update profile records for ${pendingSave.name}`,
        sourceResolver: pendingSave.sourceResolver,
        assertCurrentIdentity: pendingSave.assertCurrentIdentity,
        resolverImport,
        recordReview: pendingSave.recordReview,
      })

      analytics.capture('profile:records_update', {
        chain_id: pendingSave.chainId,
      })
      return {
        currentRecords: {
          ...pendingSave.currentRecords,
          resolverAddress: resolver,
        },
        ethAddressChanged: pendingSave.ethAddressChanged,
      }
    },
  })
