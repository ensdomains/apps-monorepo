import type { Call } from '@ens-apps/transaction-manager'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { encodeFunctionData } from 'viem'
import { ETH_REGISTRY_V2_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

// RegistryRolesLib uses nybble-packed roles in the remediated V2 deployment.
export const ROLE_SET_RESOLVER = 1n << 24n

/**
 * Grant the manager the owner opted in for `ROLE_SET_RESOLVER` on the migrated
 * name.
 *
 * No admin counterpart is emitted alongside it, and none is needed: in
 * EnhancedAccessControl an `_ADMIN` role administers itself (see the shared
 * `toAdminRole` helper), so `ROLE_SET_RESOLVER_ADMIN` can only be granted by an
 * account that already holds it. Since this call is executed by the HCA as the
 * owner's operator and is itself authorised by the owner holding
 * `ROLE_SET_RESOLVER_ADMIN`, that role is a precondition of the grant rather
 * than something the grant could establish — emitting it would add an inner
 * call that reverts the whole atomic batch in exactly the cases where it would
 * have mattered. The owner's ability to revoke therefore comes from the token
 * roles the migration's registration leaves behind, not from this batch.
 */
export const buildRoleGrantCall = (name: ClassifiedName): Call => {
  if (!name.managerAddress) {
    throw new Error(`No manager address for ${name.domain.name}`)
  }

  return {
    to: V2_CONTRACTS.ETHRegistry,
    data: encodeFunctionData({
      abi: ETH_REGISTRY_V2_ABI,
      functionName: 'grantRoles',
      args: [
        labelToCanonicalId(name.label),
        ROLE_SET_RESOLVER,
        name.managerAddress,
      ],
    }),
    value: 0n,
  }
}
