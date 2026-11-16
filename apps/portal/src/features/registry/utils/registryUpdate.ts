import {
  chunkWalletBundle,
  type RegistryRepairCall,
  type RegistryRepairPlan,
} from '@ens-apps/migration'
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

/** The CREATE2 salt for `registry`'s replacement, so a stopped update finds the same address again. */
export const computeRegistryUpdateSalt = (registry: Address): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }],
        [REGISTRY_UPDATE_SALT_DOMAIN, registry],
      ),
    ),
  )

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
