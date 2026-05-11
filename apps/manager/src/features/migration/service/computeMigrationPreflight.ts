import type { Address, PublicClient } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { classifyNames } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

export type MigrationPreflight = {
  preExistingOwnedPermRes: Address | null
  skipApprovalPhase: boolean
  skipFetchProfilesPhase: boolean
  needsBaseRegistrarApproval: boolean
  needsNameWrapperApproval: boolean
}

export const EMPTY_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: true,
  skipFetchProfilesPhase: true,
  needsBaseRegistrarApproval: false,
  needsNameWrapperApproval: false,
}

const hasWrappedToken = (tokenType: string): boolean =>
  tokenType !== 'unwrapped'

const isApprovedForAll = async (params: {
  publicClient: PublicClient
  token: Address
  abi: typeof BASE_REGISTRAR_ABI | typeof NAME_WRAPPER_ABI
  eoa: Address
}): Promise<boolean> =>
  (await params.publicClient.readContract({
    address: params.token,
    abi: params.abi,
    functionName: 'isApprovedForAll',
    args: [params.eoa, V2_CONTRACTS.MigrationHelper],
  })) as boolean

export const computeMigrationPreflight = async (params: {
  eoa: Address
  domains: readonly V1Domain[]
  publicClient: PublicClient
}): Promise<MigrationPreflight> => {
  const { eoa, domains, publicClient } = params

  const { classified } = classifyNames([...domains], eoa)
  const hasUnwrapped = classified.some((n) => n.tokenType === 'unwrapped')
  const hasWrapped = classified.some((n) => hasWrappedToken(n.tokenType))

  const [baseRegistrarApproved, nameWrapperApproved] = await Promise.all([
    hasUnwrapped
      ? isApprovedForAll({
          publicClient,
          token: V1_CONTRACTS.BaseRegistrar,
          abi: BASE_REGISTRAR_ABI,
          eoa,
        })
      : Promise.resolve(true),
    hasWrapped
      ? isApprovedForAll({
          publicClient,
          token: V1_CONTRACTS.NameWrapper,
          abi: NAME_WRAPPER_ABI,
          eoa,
        })
      : Promise.resolve(true),
  ])

  const needsBaseRegistrarApproval = hasUnwrapped && !baseRegistrarApproved
  const needsNameWrapperApproval = hasWrapped && !nameWrapperApproved

  return {
    preExistingOwnedPermRes: null,
    skipApprovalPhase: !needsBaseRegistrarApproval && !needsNameWrapperApproval,
    skipFetchProfilesPhase: true,
    needsBaseRegistrarApproval,
    needsNameWrapperApproval,
  }
}
