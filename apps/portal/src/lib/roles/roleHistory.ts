import type { Address, Hex } from 'viem'

/** Roles at this resource apply to every name in the registry. */
export const ROOT_RESOURCE = 0n

/** A root-resource or name-token permission change from BigName. */
export type RoleHistoryEntry = {
  readonly account: Address
  /** EAC resource as hex; set for root-resource changes only. */
  readonly resource?: string
  readonly oldRoles: readonly string[]
  readonly newRoles: readonly string[]
  readonly transactionHash: Hex
  readonly timestamp: bigint
  readonly blockNumber: bigint
}
