import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { readContracts, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, erc721Abi } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { NAME_WRAPPER_ABI } from '../contracts/abis'
import type { GroupedNames } from './classifyNames'

const BASE_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensBaseRegistrarImplementation',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})

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

type ApprovalKey = keyof HelperApprovalStatus
type MutableHelperApprovalStatus = {
  -readonly [Key in ApprovalKey]: HelperApprovalStatus[Key]
}
type ApprovalContract = Parameters<typeof readContracts>[1]['contracts'][number]

export const checkHelperApprovals = async (params: {
  eoa: Address
  helperAddress: Address
  needs: ApprovalNeeds
  wagmiConfig: WagmiConfig
}): Promise<HelperApprovalStatus> => {
  const { eoa, helperAddress, needs, wagmiConfig } = params

  const status: HelperApprovalStatus = {
    baseRegistrarApproved: true,
    nameWrapperApproved: true,
  }
  const keys: ApprovalKey[] = []
  const contracts: ApprovalContract[] = []

  if (needs.hasUnwrapped) {
    keys.push('baseRegistrarApproved')
    contracts.push({
      address: BASE_REGISTRAR,
      abi: erc721Abi,
      functionName: 'isApprovedForAll',
      args: [eoa, helperAddress],
    })
  }

  if (needs.hasWrapped) {
    keys.push('nameWrapperApproved')
    contracts.push({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'isApprovedForAll',
      args: [eoa, helperAddress],
    })
  }

  if (contracts.length === 0) return status

  const approvals = (await readContracts(wagmiConfig, {
    contracts,
    allowFailure: false,
    batchSize: 0,
  })) as readonly boolean[]

  const result: MutableHelperApprovalStatus = { ...status }
  for (const [index, approved] of approvals.entries()) {
    const key = keys[index]
    if (key) result[key] = approved
  }
  return result
}
