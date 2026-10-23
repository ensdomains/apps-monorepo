import type { MigrationTokenType } from './classifyNames'

// Leave room for 10% submission headroom below the RPC gas cap of 2^24.
export const TARGET_GAS = 15_000_000n

export const PER_BATCH_OVERHEAD = 80_000n

export const GAS_HEURISTIC: Record<MigrationTokenType, bigint> = {
  unwrapped: 195_000n,
  unlocked: 220_000n,
  'locked-2ld': 240_000n,
  'locked-child': 150_000n,
  'detached-child': 150_000n,
}

export const SETTEXT_GAS = 50_000n
export const SETADDR_GAS = 35_000n
export const SETCONTENTHASH_GAS = 50_000n
export const SETABI_GAS = 70_000n
export const SETINTERFACE_GAS = 40_000n
export const MULTICALL_OVERHEAD = 60_000n

export const GRANT_ROLES_GAS = 80_000n

// Headroom kept under TARGET_GAS when the final batch carries the cleanup
// revoke in one atomic wallet bundle (revoke + the wallet's batch overhead).
export const BUNDLED_CLEANUP_GAS = 200_000n

export const maxOuterGasFor = (canBatchAtomically = false): bigint =>
  canBatchAtomically ? TARGET_GAS - BUNDLED_CLEANUP_GAS : TARGET_GAS
