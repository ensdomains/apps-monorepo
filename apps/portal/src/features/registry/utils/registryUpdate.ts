import {
  chunkWalletBundle,
  type RegistryRepairCall,
  type RegistryRepairPlan,
} from '@ens-apps/migration'
import { type Address, encodeAbiParameters, keccak256, stringToHex } from 'viem'

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
