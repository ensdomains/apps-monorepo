import { readContract, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, erc721Abi } from 'viem'
import { NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { GroupedNames } from './classifyNames'

type ApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly hasWrapped: boolean
}

export const approvalNeedsFor = (groups: GroupedNames): ApprovalNeeds => ({
  hasUnwrapped: groups.unwrapped.length > 0,
  hasWrapped:
    groups.unlocked.length > 0 ||
    groups.locked2ld.length > 0 ||
    groups.childNames.size > 0,
})

type HelperApprovalStatus = {
  readonly baseRegistrarApproved: boolean
  readonly nameWrapperApproved: boolean
}

export const checkHelperApprovals = async (params: {
  eoa: Address
  helperAddress: Address
  needs: ApprovalNeeds
  wagmiConfig: WagmiConfig
}): Promise<HelperApprovalStatus> => {
  const { eoa, helperAddress, needs, wagmiConfig } = params

  const [baseRegistrarApproved, nameWrapperApproved] = await Promise.all([
    needs.hasUnwrapped
      ? (readContract(wagmiConfig, {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: erc721Abi,
          functionName: 'isApprovedForAll',
          args: [eoa, helperAddress],
        }) as Promise<boolean>)
      : Promise.resolve(true),
    needs.hasWrapped
      ? (readContract(wagmiConfig, {
          address: V1_CONTRACTS.NameWrapper,
          abi: NAME_WRAPPER_ABI,
          functionName: 'isApprovedForAll',
          args: [eoa, helperAddress],
        }) as Promise<boolean>)
      : Promise.resolve(true),
  ])

  return { baseRegistrarApproved, nameWrapperApproved }
}
