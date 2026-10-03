import type { Config } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { buildMigrationPlan } from './buildMigrationPlan'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import type { V1Domain } from './v1SubgraphClient'

export const prepareGraceRenewalMigration = async (params: {
  readonly domains: readonly V1Domain[]
  readonly renewedDomains: readonly V1Domain[]
  readonly ownerAddress: Address
  readonly hcaAddress: Address
  readonly publicClient: PublicClient
  readonly wagmiConfig: Config
  readonly signal?: AbortSignal
}) => {
  const refreshed = new Map(
    params.renewedDomains.map((domain) => [domain.id, domain]),
  )
  const domains = params.domains.map(
    (domain) => refreshed.get(domain.id) ?? domain,
  )
  params.signal?.throwIfAborted()
  const preflight = await computeMigrationPreflight({
    eoa: params.ownerAddress,
    hcaAddress: params.hcaAddress,
    domains,
    wagmiConfig: params.wagmiConfig,
    publicClient: params.publicClient,
    signal: params.signal,
  })
  const plan = await buildMigrationPlan({
    domains,
    hcaAddress: params.hcaAddress,
    migrationOwner: params.ownerAddress,
    publicClient: params.publicClient,
    preflight,
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
