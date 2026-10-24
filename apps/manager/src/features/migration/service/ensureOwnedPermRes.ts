import { computeVerifiableProxyAddress } from '@ens-apps/smart-account'
import type { Call } from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeFunctionData,
  isAddressEqual,
  type PublicClient,
  parseAbi,
} from 'viem'
import { VERIFIABLE_FACTORY_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from '../contracts/permissionedResolverAddress'

const factoryVerificationAbi = parseAbi([
  'function verifyContract(address) view returns(address)',
])

export const findExistingPermRes = async (params: {
  eoa: Address
  deployer?: Address
  publicClient: PublicClient
}): Promise<Address | null> => {
  const { eoa, deployer, publicClient } = params
  const expectedSalt = computeOwnedResolverSalt(eoa, 0n)
  // The factory address is deterministic. Looking it up directly avoids an
  // unbounded historical event scan and still verifies the live implementation.
  for (const account of new Set([eoa, ...(deployer ? [deployer] : [])])) {
    const resolver = computeVerifiableProxyAddress({
      factory: V2_CONTRACTS.VerifiableFactory,
      proxyLogic: V2_CONTRACTS.VerifiableFactoryProxyLogic,
      deployer: account,
      salt: expectedSalt,
    })
    const code = await publicClient.getCode({ address: resolver })
    if (!code || code === '0x') continue
    const implementation = await publicClient.readContract({
      address: V2_CONTRACTS.VerifiableFactory,
      abi: factoryVerificationAbi,
      functionName: 'verifyContract',
      args: [resolver],
    })
    if (!isAddressEqual(implementation, V2_CONTRACTS.PermissionedResolverImpl))
      throw new Error(
        'Your existing resolver has an unsupported implementation. Review it before replacing the resolver.',
      )
    return resolver
  }
  return null
}

/**
 * Build the `deployProxy` call for the owner's dedicated PermissionedResolver,
 * without submitting it. `owner` must be the EOA that owns the name: the
 * resolver checks roles against the raw `msg.sender` (it has no smart-account
 * mapping), so the owner has to hold the roles it grants itself, and the
 * VerifiableFactory also mixes `msg.sender` into the proxy address. Lets
 * callers batch the deploy alongside `setResolver` and a record write in a
 * single intent.
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
