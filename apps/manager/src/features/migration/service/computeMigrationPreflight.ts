import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import {
  approvalNeedsFor,
  checkSCAApprovals,
} from '@/features/migration/service/checkSCAApprovals'
import {
  classifyNames,
  groupClassifiedNames,
} from '@/features/migration/service/classifyNames'
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
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
}

export const computeMigrationPreflight = async (params: {
  eoa: Address
  scaAddress: Address
  domains: readonly V1Domain[]
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
}): Promise<MigrationPreflight> => {
  const { eoa, scaAddress, domains, wagmiConfig, publicClient } = params

  const { classified } = classifyNames([...domains], eoa)
  const groups = groupClassifiedNames(classified)

  const needs = approvalNeedsFor(groups)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  const needsOwnedPermRes = namesToOwnedPermRes.length > 0

  const [existingPermRes, approvals] = await Promise.all([
    needsOwnedPermRes
      ? findExistingPermRes({ eoa, publicClient })
      : Promise.resolve(null),
    checkSCAApprovals({ eoa, scaAddress, needs, wagmiConfig }),
  ])

  const skipApprovalPhase =
    (!needs.hasUnwrapped || approvals.baseRegistrarApproved) &&
    (!needs.hasWrapped || approvals.nameWrapperApproved)

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
    }
  }

  return {
    preExistingOwnedPermRes: existingPermRes,
    skipApprovalPhase,
    skipFetchProfilesPhase,
  }
}
