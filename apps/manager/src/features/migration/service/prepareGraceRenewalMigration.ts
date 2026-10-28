import type { V1Domain } from '@ens-apps/migration'
import type { Config } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { buildMigrationPlan } from './buildMigrationPlan'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { discoverSubnameRecreation } from './subnameRecreation'

export const prepareGraceRenewalMigration = async (params: {
  readonly domains: readonly V1Domain[]
  readonly renewedDomains: readonly V1Domain[]
  readonly ownerAddress: Address
  readonly hcaAddress: Address
  readonly publicClient: PublicClient
  readonly wagmiConfig: Config
  /** Names whose ENSv1 controller the owner chose to keep as an ENSv2 manager. */
  readonly managerRestorationNames?: readonly string[]
  /** The owner wallet bundles calls atomically (EIP-5792). */
  readonly canBatchAtomically?: boolean
  readonly isSubnameRecreationEnabled?: boolean
  readonly signal?: AbortSignal
}) => {
  const managerRestorationNames = params.managerRestorationNames ?? []
  const refreshed = new Map(
    params.renewedDomains.map((domain) => [domain.id, domain]),
  )
  const domains = params.domains.map(
    (domain) => refreshed.get(domain.id) ?? domain,
  )
  params.signal?.throwIfAborted()
  const discovery = params.isSubnameRecreationEnabled
    ? await discoverSubnameRecreation({
        domains,
        owner: params.ownerAddress,
        publicClient: params.publicClient,
        signal: params.signal,
      })
    : undefined
  const recreation = discovery?.snapshot.roots.length ? discovery : undefined
  const preflight = await computeMigrationPreflight({
    eoa: params.ownerAddress,
    hcaAddress: params.hcaAddress,
    domains,
    requiresManagerRestoration: managerRestorationNames.length > 0,
    registrationApprovalPolicy: params.canBatchAtomically
      ? 'per-token'
      : 'temporary-operator',
    wagmiConfig: params.wagmiConfig,
    publicClient: params.publicClient,
    signal: params.signal,
  })
  const plan = await buildMigrationPlan({
    domains: recreation?.domains ?? domains,
    subnameRecreation: recreation
      ? { snapshot: recreation.snapshot }
      : undefined,
    hcaAddress: params.hcaAddress,
    migrationOwner: params.ownerAddress,
    managerRestorationNames,
    publicClient: params.publicClient,
    preflight,
    canBatchAtomically: params.canBatchAtomically,
    signal: params.signal,
  })
  params.signal?.throwIfAborted()
  const included = new Set(plan.classified.map(({ domain }) => domain.name))
  if (domains.some(({ name }) => !included.has(name))) {
    throw new Error(
      'Your names were renewed, but some cannot be upgraded. Go back to check your selection.',
    )
  }
  return plan
}
