import type { Address } from 'viem'

export type RegistrationPostRegistrationSetup = {
  primaryName?: {
    enabled: boolean
    syncEthRecord?: boolean
  }
}

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
      syncEthRecord: AUTO_SYNC_ETH_RECORD_DURING_REGISTRATION,
    },
  }
}
