import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { V2_CONTRACTS } from '@/features/migration/contracts/addresses'
import {
  approvalNeedsFor,
  checkHelperApprovals,
} from '@/features/migration/service/checkHelperApprovals'
import {
  classifyNames,
  groupClassifiedNames,
} from '@/features/migration/service/classifyNames'
import { findExistingPermRes } from '@/features/migration/service/ensureOwnedPermRes'
import type {
  V1Domain,
  V1ProfileKeys,
} from '@/features/migration/service/v1SubgraphClient'
import { getV1ProfileKeys } from '@/features/migration/service/v1SubgraphClient'

export type MigrationPreflight = {
  preExistingOwnedPermRes: Address | null
  skipApprovalPhase: boolean
  skipFetchProfilesPhase: boolean
  baseRegistrarApproved: boolean
  nameWrapperApproved: boolean
  profileKeys?: readonly V1ProfileKeys[]
}

export const EMPTY_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
  baseRegistrarApproved: false,
  nameWrapperApproved: false,
}

export const computeMigrationPreflight = async (params: {
  eoa: Address
  domains: readonly V1Domain[]
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
}): Promise<MigrationPreflight> => {
  const { eoa, domains, wagmiConfig, publicClient } = params

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
    checkHelperApprovals({
      eoa,
      helperAddress: V2_CONTRACTS.MigrationHelper,
      needs,
      wagmiConfig,
    }),
  ])

  const skipApprovalPhase =
    (!needs.hasUnwrapped || approvals.baseRegistrarApproved) &&
    (!needs.hasWrapped || approvals.nameWrapperApproved)

  let skipFetchProfilesPhase = false
  let profileKeys: readonly V1ProfileKeys[] | undefined
  if (namesToOwnedPermRes.length === 0) {
    skipFetchProfilesPhase = true
  } else {
    const keysResult = await getV1ProfileKeys(
      namesToOwnedPermRes.map((n) => n.domain.id),
    )
    if (keysResult.isOk()) {
      profileKeys = keysResult.value
      const anyKeys = profileKeys.some(
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
    skipApprovalPhase,
    skipFetchProfilesPhase,
    baseRegistrarApproved: approvals.baseRegistrarApproved,
    nameWrapperApproved: approvals.nameWrapperApproved,
    profileKeys,
  }
}
