import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import {
  type Address,
  decodeEventLog,
  type Hex,
  type PublicClient,
  parseAbiItem,
  toEventSelector,
} from 'viem'
import { VERIFIABLE_FACTORY_ABI } from '../contracts/abis'
import { V2_CONTRACTS, V2_DEPLOY_BLOCK } from '../contracts/addresses'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from '../contracts/permissionedResolverAddress'

export class OwnedResolverDeployError extends TaggedError(
  'OwnedResolverDeployError',
)<{ cause: unknown }> {}

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)
const PROXY_DEPLOYED_TOPIC: Hex = toEventSelector(proxyDeployedEvent)

const parseProxyAddress = (
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
): Address | null => {
  for (const log of logs) {
    if (log.topics[0] !== PROXY_DEPLOYED_TOPIC) continue
    const decoded = decodeEventLog({
      abi: VERIFIABLE_FACTORY_ABI,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    if (decoded.eventName === 'ProxyDeployed') {
      return decoded.args.proxyAddress
    }
  }
  return null
}

export const findExistingPermRes = async (params: {
  eoa: Address
  publicClient: PublicClient
}): Promise<Address | null> => {
  const { eoa, publicClient } = params
  const expectedSalt = computeOwnedResolverSalt(eoa, 0n)
  const impl = V2_CONTRACTS.PermissionedResolverImpl.toLowerCase()
  const logs = await publicClient.getLogs({
    address: V2_CONTRACTS.VerifiableFactory,
    event: proxyDeployedEvent,
    args: { sender: eoa },
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

export const predictOwnedPermResAddress = async (params: {
  eoa: Address
  publicClient: PublicClient
}): Promise<Address> => {
  const { eoa, publicClient } = params
  const existing = await findExistingPermRes({ eoa, publicClient })
  if (existing) return existing
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
    account: eoa,
  })
  return result
}

export const ensureOwnedPermRes = async (params: {
  eoa: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
}): Promise<Address> => {
  const { eoa, wagmiConfig, publicClient } = params

  const existing = await findExistingPermRes({ eoa, publicClient })
  if (existing) {
    return existing
  }

  const salt = computeOwnedResolverSalt(eoa, 0n)
  let hash: Hex
  try {
    hash = await writeContract(wagmiConfig, {
      address: V2_CONTRACTS.VerifiableFactory,
      abi: VERIFIABLE_FACTORY_ABI,
      functionName: 'deployProxy',
      args: [
        V2_CONTRACTS.PermissionedResolverImpl,
        salt,
        getOwnedPermResInitCalldata(eoa),
      ],
    })
  } catch (cause) {
    throw new OwnedResolverDeployError({ cause })
  }

  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    hash,
    timeout: 300_000,
  })
  if (receipt.status !== 'success') {
    throw new OwnedResolverDeployError({
      cause: new Error(`deployProxy tx reverted (hash=${hash})`),
    })
  }

  const deployed = parseProxyAddress(
    receipt.logs as readonly { topics: readonly Hex[]; data: Hex }[],
  )
  if (!deployed) {
    throw new OwnedResolverDeployError({
      cause: new Error('deployProxy succeeded but ProxyDeployed log not found'),
    })
  }
  return deployed
}
