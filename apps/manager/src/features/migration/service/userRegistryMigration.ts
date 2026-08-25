import {
  computeVerifiableProxyAddress,
  ROLES_ALL,
} from '@ens-apps/smart-account'
import type { Call } from '@ens-apps/transaction-manager'
import { eacGrantRootRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  userRegistryInitializeSnippet,
  userRegistryRegisterSnippet,
} from '@ensdomains/ensjs-abi/v2/userRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
} from 'viem'
import { V2_CONTRACTS } from '../contracts/addresses'

const userRegistrySetParentAbi = parseAbi([
  'function setParent(address parent, string label)',
])

const USER_REGISTRY_SALT_DOMAIN = keccak256(
  stringToHex('ENSManagerMigrationUserRegistry:v1'),
)

/**
 * Derive the application salt used for a parent name's UserRegistry.
 *
 * VerifiableFactory additionally namespaces this value by `msg.sender`, so the
 * HCA must be used as the deployer when predicting the final proxy address.
 */
export const computeUserRegistrySalt = (parentName: string): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }],
        [USER_REGISTRY_SALT_DOMAIN, namehash(parentName)],
      ),
    ),
  )

/** Predict the UserRegistry proxy for `parentName` without a chain read. */
export const computeUserRegistryAddress = (params: {
  readonly hca: Address
  readonly parentName: string
}): Address =>
  computeVerifiableProxyAddress({
    factory: V2_CONTRACTS.VerifiableFactory,
    proxyLogic: V2_CONTRACTS.VerifiableFactoryProxyLogic,
    deployer: params.hca,
    salt: computeUserRegistrySalt(params.parentName),
  })

/** Deploy and initialize the parent name's deterministic UserRegistry proxy. */
export const buildDeployUserRegistryCall = (params: {
  readonly hca: Address
  readonly parentName: string
}): Call => ({
  to: V2_CONTRACTS.VerifiableFactory,
  value: 0n,
  data: encodeFunctionData({
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [
      V2_CONTRACTS.UserRegistryImpl,
      computeUserRegistrySalt(params.parentName),
      encodeFunctionData({
        abi: userRegistryInitializeSnippet,
        functionName: 'initialize',
        args: [params.hca, ROLES_ALL],
      }),
    ],
  }),
})

/** Give the wallet direct root control of a newly deployed UserRegistry. */
export const buildGrantUserRegistryWalletRolesCall = (params: {
  readonly registry: Address
  readonly wallet: Address
}): Call => ({
  to: params.registry,
  value: 0n,
  data: encodeFunctionData({
    abi: eacGrantRootRolesSnippet,
    functionName: 'grantRootRoles',
    args: [ROLES_ALL, params.wallet],
  }),
})

/** Connect a newly deployed UserRegistry to its canonical parent path. */
export const buildSetUserRegistryParentCall = (params: {
  readonly registry: Address
  readonly parentRegistry: Address
  readonly parentLabel: string
}): Call => ({
  to: params.registry,
  value: 0n,
  data: encodeFunctionData({
    abi: userRegistrySetParentAbi,
    functionName: 'setParent',
    args: [params.parentRegistry, params.parentLabel],
  }),
})

/**
 * Build the exact setup sequence for a new UserRegistry:
 * deploy → wallet root grant → canonical parent metadata.
 */
export const buildUserRegistrySetupCalls = (params: {
  readonly hca: Address
  readonly parentName: string
  readonly parentRegistry: Address
  readonly parentLabel: string
  readonly wallet: Address
}): readonly Call[] => {
  const registry = computeUserRegistryAddress(params)
  return [
    buildDeployUserRegistryCall(params),
    buildGrantUserRegistryWalletRolesCall({
      registry,
      wallet: params.wallet,
    }),
    buildSetUserRegistryParentCall({
      registry,
      parentRegistry: params.parentRegistry,
      parentLabel: params.parentLabel,
    }),
  ]
}

/** Register one copied V1 child in its immediate V2 parent registry. */
export const buildRegisterCopiedSubnameCall = (params: {
  readonly registry: Address
  readonly label: string
  readonly owner: Address
  readonly childRegistry: Address
  readonly resolver: Address
  readonly expiry: bigint
}): Call => ({
  to: params.registry,
  value: 0n,
  data: encodeFunctionData({
    abi: userRegistryRegisterSnippet,
    functionName: 'register',
    args: [
      params.label,
      params.owner,
      params.childRegistry,
      params.resolver,
      ROLES_ALL,
      params.expiry,
    ],
  }),
})
