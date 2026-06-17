import type { RegistrationPostRegistrationSetup } from '@ens-apps/transaction-manager'
import type { Address } from 'viem'

// Product decision pending: keep ETH record sync configurable so manager can
// request ETH-record-only post-registration setup later without reshaping the
// shared transaction-manager API. This flag must not be used to disable the
// ETH-record prerequisite when auto primary-name setup is enabled.
export const AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION = false

export function getManagerRegistrationPostRegistrationSetup(params: {
  ownerAddress?: Address | null
  existingPrimaryName?: string | null
}): RegistrationPostRegistrationSetup | undefined {
  if (!params.ownerAddress || params.existingPrimaryName) {
    return undefined
  }

  return {
    primaryName: {
      enabled: true,
      // `enabled: true` in transaction-manager always syncs the ETH record
      // before attempting primary-name setup. This flag remains separate so
      // manager can opt into ETH-record-only setup later if product wants it.
      syncEthRecord: AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION,
      // Future L2 support should be selected here and passed through the shared
      // setup config rather than inferred inside transaction-manager.
    },
  }
}
