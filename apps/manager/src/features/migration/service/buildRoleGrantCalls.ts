import type { Call } from '@ens-apps/transaction-manager'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type Address, encodeFunctionData } from 'viem'
import { ETH_REGISTRY_V2_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

// RegistryRolesLib uses nybble-packed roles in the remediated V2 deployment.
export const ROLE_SET_RESOLVER = 1n << 24n
/**
 * EnhancedAccessControl puts every role's admin 128 bits above it, and admin
 * roles administer themselves. Holding it is what lets an account grant — and
 * later revoke — `ROLE_SET_RESOLVER` for a resource.
 */
export const ROLE_SET_RESOLVER_ADMIN = ROLE_SET_RESOLVER << 128n

const grantRolesCall = (params: {
  readonly resource: bigint
  readonly roleBitmap: bigint
  readonly account: Address
}): Call => ({
  to: V2_CONTRACTS.ETHRegistry,
  data: encodeFunctionData({
    abi: ETH_REGISTRY_V2_ABI,
    functionName: 'grantRoles',
    args: [params.resource, params.roleBitmap, params.account],
  }),
  value: 0n,
})

export const buildRoleGrantCall = (name: ClassifiedName): Call => {
  if (!name.managerAddress) {
    throw new Error(`No manager address for ${name.domain.name}`)
  }

  return grantRolesCall({
    resource: labelToCanonicalId(name.label),
    roleBitmap: ROLE_SET_RESOLVER,
    account: name.managerAddress,
  })
}

/**
 * The admin counterpart to {@link buildRoleGrantCall}, granted to the migrating
 * owner so the manager role never outlives the owner's ability to remove it.
 *
 * This is authorised by exactly the same authority as the grant it accompanies:
 * both are executed by the HCA as the owner's operator, and both require the
 * owner to hold `ROLE_SET_RESOLVER_ADMIN`. So it adds no failure mode the grant
 * does not already have, and it stops the batch from depending on whatever
 * default role bitmap the registration path happened to leave behind.
 */
export const buildRoleAdminGrantCall = (params: {
  readonly name: ClassifiedName
  readonly migrationOwner: Address
}): Call =>
  grantRolesCall({
    resource: labelToCanonicalId(params.name.label),
    roleBitmap: ROLE_SET_RESOLVER_ADMIN,
    account: params.migrationOwner,
  })
