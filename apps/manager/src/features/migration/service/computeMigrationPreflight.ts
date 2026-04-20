import { readContract, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, erc721Abi, type PublicClient } from 'viem'
import { NAME_WRAPPER_ABI } from '@/features/migration/contracts/abis'
import { V1_CONTRACTS } from '@/features/migration/contracts/addresses'
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

  const hasUnwrapped = groups.unwrapped.length > 0
  const hasWrapped =
    groups.unlocked.length > 0 ||
    groups.locked2ld.length > 0 ||
    groups.childNames.size > 0
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  const needsOwnedPermRes = namesToOwnedPermRes.length > 0

  const [existingPermRes, baseRegistrarApproved, nameWrapperApproved] =
    await Promise.all([
      needsOwnedPermRes
        ? findExistingPermRes({ eoa, publicClient })
        : Promise.resolve(null),
      hasUnwrapped
        ? (readContract(wagmiConfig, {
            address: V1_CONTRACTS.BaseRegistrar,
            abi: erc721Abi,
            functionName: 'isApprovedForAll',
            args: [eoa, scaAddress],
          }) as Promise<boolean>)
        : Promise.resolve(true),
      hasWrapped
        ? (readContract(wagmiConfig, {
            address: V1_CONTRACTS.NameWrapper,
            abi: NAME_WRAPPER_ABI,
            functionName: 'isApprovedForAll',
            args: [eoa, scaAddress],
          }) as Promise<boolean>)
        : Promise.resolve(true),
    ])

  const skipApprovalPhase =
    (!hasUnwrapped || baseRegistrarApproved) &&
    (!hasWrapped || nameWrapperApproved)

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
