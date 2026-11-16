import {
  chunkWalletBundle,
  type RegistryRepairCall,
  type RegistryRepairPlan,
  type RegistryRepairPlanError,
} from '@ens-apps/migration'
import type { Result } from 'neverthrow'
import { match, P } from 'ts-pattern'
import {
  type Address,
  encodeAbiParameters,
  isAddressEqual,
  keccak256,
  stringToHex,
} from 'viem'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'
import { isPendingUpgradeImplementation } from './pendingUpgradeRegistry'

const REGISTRY_UPDATE_SALT_DOMAIN = keccak256(
  stringToHex('ENSExplorerRegistryUpdate:v1'),
)

/** The CREATE2 salt for an attempt at replacing `registry`, so a stopped upgrade finds the same address again. */
export const computeRegistryUpdateSalt = (
  registry: Address,
  attempt: bigint,
): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
        [REGISTRY_UPDATE_SALT_DOMAIN, registry, attempt],
      ),
    ),
  )

/** A copy the original has drifted from can't be finished, so the upgrade starts a fresh one. */
export const shouldStartFreshCopy = (
  resumed: Result<unknown, RegistryRepairPlanError>,
): boolean => resumed.isErr() && resumed.error.reason === 'replacement-diverged'

export type RegistryUpdateStep = {
  readonly kind: 'copy' | 'finish'
  readonly calls: readonly RegistryRepairCall[]
}

/** One wallet confirmation per step: bundles the wallet accepts when it batches atomically, one call each otherwise. */
export const getRegistryUpdateSteps = ({
  plan,
  canBatchAtomically,
}: {
  readonly plan: Pick<RegistryRepairPlan, 'copyCalls' | 'finalCalls'>
  readonly canBatchAtomically: boolean
}): readonly RegistryUpdateStep[] => {
  const group = (calls: readonly RegistryRepairCall[]) =>
    canBatchAtomically ? chunkWalletBundle(calls) : calls.map((call) => [call])
  return [
    ...group(plan.copyCalls).map((calls) => ({ kind: 'copy' as const, calls })),
    ...group(plan.finalCalls).map((calls) => ({
      kind: 'finish' as const,
      calls,
    })),
  ]
}

/** What the update leaves behind, shown on its first step so the user sees it before signing. */
export const getRegistryUpdateDetails = ({
  plan,
  expiredLabels,
}: {
  readonly plan: Pick<RegistryRepairPlan, 'unmovedChildren'>
  readonly expiredLabels: readonly string[]
}): readonly { readonly label: string; readonly value: string }[] => [
  ...(expiredLabels.length > 0
    ? [{ label: 'Expired, not copied', value: expiredLabels.join(', ') }]
    : []),
  ...(plan.unmovedChildren.length > 0
    ? [
        {
          label: 'Subname registries left on the old parent',
          value: plan.unmovedChildren.map((child) => child.label).join(', '),
        },
      ]
    : []),
]

export type RegistryUpdateBlocker =
  | 'outdated-implementation'
  | 'registry-replaced'
  | 'unknown-label'

/** Why an update may not run now, or null when it can. */
export const getRegistryUpdateBlocker = (params: {
  readonly chainId: number
  /** The implementation the replacement would be deployed from. */
  readonly implementation: Address
  readonly registry: Address
  /** What the parent name points at right now. */
  readonly currentSubregistry: Address
  readonly label: string
}): RegistryUpdateBlocker | null => {
  // Never copy onto an implementation that would itself need updating.
  if (isPendingUpgradeImplementation(params)) return 'outdated-implementation'
  // Someone pointed the name elsewhere; switching it back would drop their registry.
  if (!isAddressEqual(params.currentSubregistry, params.registry))
    return 'registry-replaced'
  // `setParent` needs the label's text, which an encoded label doesn't give.
  if (isEncodedLabelhash(params.label)) return 'unknown-label'
  return null
}

export type RegistryUpdateFailure =
  | 'missing-roles'
  | 'registry-replaced'
  | 'unknown-label'
  | 'unavailable'
  | 'read-failed'

const reasonOf = (error: unknown): string | undefined => {
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? error.cause
      : undefined
  if (typeof cause === 'string') return cause
  return typeof cause === 'object' &&
    cause !== null &&
    'reason' in cause &&
    typeof cause.reason === 'string'
    ? cause.reason
    : undefined
}

/** Why planning an upgrade failed, in the terms the card explains to the user. */
export const getRegistryUpdateFailure = (
  error: unknown,
): RegistryUpdateFailure =>
  match(reasonOf(error))
    .with(
      P.union(
        'no-root-roles',
        'cannot-register',
        'cannot-set-parent',
        'cannot-grant',
      ),
      () => 'missing-roles' as const,
    )
    .with('registry-replaced', () => 'registry-replaced' as const)
    .with('unknown-label', () => 'unknown-label' as const)
    .with(
      P.union(
        'outdated-implementation',
        'name-without-owner',
        'duplicate-label',
        'replacement-diverged',
      ),
      () => 'unavailable' as const,
    )
    .otherwise(() => 'read-failed' as const)
