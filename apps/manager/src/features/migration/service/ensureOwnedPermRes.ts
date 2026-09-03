import type { Call } from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeFunctionData,
  type PublicClient,
  parseAbiItem,
} from 'viem'
import { VERIFIABLE_FACTORY_ABI } from '../contracts/abis'
import { V2_CONTRACTS, V2_DEPLOY_BLOCK } from '../contracts/addresses'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from '../contracts/permissionedResolverAddress'

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)

export const findExistingPermRes = async (params: {
  eoa: Address
  deployer?: Address
  publicClient: PublicClient
}): Promise<Address | null> => {
  const { eoa, deployer, publicClient } = params
  const expectedSalt = computeOwnedResolverSalt(eoa, 0n)
  const impl = V2_CONTRACTS.PermissionedResolverImpl.toLowerCase()
  const logs = await publicClient.getLogs({
    address: V2_CONTRACTS.VerifiableFactory,
    event: proxyDeployedEvent,
    args: { sender: deployer ? [eoa, deployer] : eoa },
    fromBlock: V2_DEPLOY_BLOCK,
    toBlock: 'latest',
  })
  for (const log of [...logs].reverse()) {
    if (log.args.implementation?.toLowerCase() !== impl) continue
    if (log.args.salt !== expectedSalt) continue
    return log.args.proxyAddress as Address
  }
  return null
}

/**
 * Build the `deployProxy` call for the owner's dedicated PermissionedResolver,
 * without submitting it. `owner` must be the EOA that owns the name, even when
 * a smart account executes the call: the resolver resolves smart-account
 * callers to their HCA owner before checking roles, so roles granted to the
 * smart account itself would lock the owner out. The VerifiableFactory also
 * mixes `msg.sender` into the proxy address, so who executes this call changes
 * where it lands. Lets callers batch the deploy alongside `setResolver` and a
 * record write in a single intent.
 */
export const buildDeployOwnedPermResCall = (owner: Address): Call => ({
  to: V2_CONTRACTS.VerifiableFactory,
  data: encodeFunctionData({
    abi: VERIFIABLE_FACTORY_ABI,
    functionName: 'deployProxy',
    args: [
      V2_CONTRACTS.PermissionedResolverImpl,
      computeOwnedResolverSalt(owner, 0n),
      getOwnedPermResInitCalldata(owner),
    ],
  }),
  value: 0n,
})

/**
 * The CREATE2 address `deployProxy` would return for `eoa`, computed by
 * simulating the (not-yet-submitted) deploy. Assumes no owned resolver exists
 * yet. Pass `deployer` when the real deploy will be executed by a different
 * account (the factory mixes `msg.sender` into the address, so simulating from
 * anyone else predicts the wrong location).
 */
export const simulateOwnedPermResAddress = async (params: {
  eoa: Address
  /** Account that will execute the deploy; defaults to the EOA. */
  deployer?: Address
  publicClient: PublicClient
}): Promise<Address> => {
  const { eoa, deployer, publicClient } = params
  const salt = computeOwnedResolverSalt(eoa, 0n)
  const { result } = await publicClient.simulateContract({
    address: V2_CONTRACTS.VerifiableFactory,
    abi: VERIFIABLE_FACTORY_ABI,
    functionName: 'deployProxy',
    args: [
      V2_CONTRACTS.PermissionedResolverImpl,
      salt,
      getOwnedPermResInitCalldata(eoa),
    ],
    account: deployer ?? eoa,
  })
  return result
}
