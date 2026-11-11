import type { ProfileSaveAttempt } from '@ens-apps/utils/posthog/profileEditing'
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
  readonly analyticsAttempt?: ProfileSaveAttempt
}

interface SetupResolverMutationVariables {
  readonly pendingSave: Extract<PendingSave, { kind: 'setup' }>
  readonly analyticsAttempt?: ProfileSaveAttempt
}

export const getSaveRecordsMutationOptions = () =>
  mutationOptions({
    mutationFn: async ({
      currentRecords: _currentRecords,
      analyticsAttempt,
      ...params
    }: SaveRecordsMutationVariables) => {
      const analytics = analyticsAttempt ?? startAnalyticsOperation()
      try {
        const result = await saveRecords(params)
        analytics.capture('profile:records_update', {
          chain_id: params.chainId,
          ...(analyticsAttempt?.flow_id
            ? { flow_id: analyticsAttempt.flow_id }
            : {}),
        })
        analyticsAttempt?.complete()
        return result
      } catch (error) {
        analyticsAttempt?.fail('execution')
        throw error
      }
    },
  })

export const getSetupResolverMutationOptions = (
  resolverImport?: ResolverImport,
) =>
  mutationOptions({
    mutationFn: async ({
      pendingSave,
      analyticsAttempt,
    }: SetupResolverMutationVariables) => {
      const analytics = analyticsAttempt ?? startAnalyticsOperation()
      if (!pendingSave.recordReview) {
        analyticsAttempt?.fail('preparation')
        throw new Error(
          'Review the exact records before replacing the resolver.',
        )
      }
      try {
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
          ...(analyticsAttempt?.flow_id
            ? { flow_id: analyticsAttempt.flow_id }
            : {}),
        })
        analyticsAttempt?.complete()
        return {
          currentRecords: {
            ...pendingSave.currentRecords,
            resolverAddress: resolver,
          },
          ethAddressChanged: pendingSave.ethAddressChanged,
        }
      } catch (error) {
        analyticsAttempt?.fail('execution')
        throw error
      }
    },
  })
