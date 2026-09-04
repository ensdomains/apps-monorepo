import type { Address, Hex } from 'viem'

/** One `EACRolesChanged` log, decoded for display. */
export type RoleHistoryEntry = {
  readonly account: Address
  readonly resource: string
  readonly oldRoles: readonly string[]
  readonly newRoles: readonly string[]
  readonly transactionHash: Hex
  readonly timestamp: bigint
  readonly blockNumber: bigint
}
