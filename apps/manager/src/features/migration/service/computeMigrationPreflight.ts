import type { Address, PublicClient } from 'viem'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { findExistingPermRes } from '@/features/migration/service/ensureOwnedPermRes'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { getV1ProfileKeys } from '@/features/migration/service/v1SubgraphClient'

export type MigrationPreflight = {
  preExistingOwnedPermRes: Address | null
  skipApprovalPhase: boolean
  skipFetchProfilesPhase: boolean
}

export const EMPTY_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: true,
  skipFetchProfilesPhase: false,
}

export const computeMigrationPreflight = async (params: {
  eoa: Address
  domains: readonly V1Domain[]
  publicClient: PublicClient
}): Promise<MigrationPreflight> => {
  const { eoa, domains, publicClient } = params

  const { classified } = classifyNames([...domains], eoa)

  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  const needsOwnedPermRes = namesToOwnedPermRes.length > 0

  const existingPermRes = needsOwnedPermRes
    ? await findExistingPermRes({ eoa, publicClient })
    : null

  let skipFetchProfilesPhase = false
  if (namesToOwnedPermRes.length === 0) {
    skipFetchProfilesPhase = true
  } else {
    const keysResult = await getV1ProfileKeys(
      namesToOwnedPermRes.map((n) => n.domain.id),
    )
    if (keysResult.isOk()) {
      const anyKeys = keysResult.value.some(
        (k) => k.texts.length > 0 || k.coinTypes.length > 0,
      )
      skipFetchProfilesPhase = !anyKeys
    } else {
      console.warn(
        '[migration] getV1ProfileKeys failed, defaulting to full profile fetch:',
        keysResult.error,
      )
    }
  }

  return {
    preExistingOwnedPermRes: existingPermRes,
    skipApprovalPhase: true,
    skipFetchProfilesPhase,
  }
}
