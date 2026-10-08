import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { Config } from '@wagmi/core'
import {
  type Address,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { chain } from '@/config'
import { buildMigrationPlan } from './buildMigrationPlan'
import type { MigrationWalletRequestDescriptor } from './buildStepDescriptors'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { estimateGraceRenewalGas } from './estimateGraceRenewalGas'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type { GraceRenewalQuote } from './graceRenewal'
import type { V1Domain } from './v1SubgraphClient'

const GRACE_PERIOD = BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)

type Params = {
  readonly quote: GraceRenewalQuote
  readonly domains: readonly V1Domain[]
  readonly hcaAddress: Address
  readonly publicClient: PublicClient
  readonly wagmiConfig: Config
  /** Names whose ENSv1 controller the owner chose to keep as an ENSv2 manager. */
  readonly managerRestorationNames?: readonly string[]
  readonly signal?: AbortSignal
}

export type GraceRenewalMigrationGasEstimate = {
  readonly gasUnits: bigint
  readonly feeWei: bigint
  readonly transactionCount: number
  readonly stepDescriptors: readonly MigrationWalletRequestDescriptor[]
}

const assertQuoteFresh = (quote: GraceRenewalQuote): void => {
  if (quote.expiresAt <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('The renewal quote expired. Refresh the estimate.')
  }
}

const projectSelectedDomains = ({
  quote,
  domains,
  publicClient,
}: Params): readonly V1Domain[] => {
  if (quote.chainId !== chain.id || publicClient.chain?.id !== quote.chainId) {
    throw new Error('Switch to the migration network to estimate the fee.')
  }
  assertQuoteFresh(quote)
  const selected = new Map(
    domains.map((domain) => [domain.id.toLowerCase(), domain]),
  )
  const items = new Map(
    quote.items.map((item) => [item.domain.id.toLowerCase(), item]),
  )
  if (
    domains.length === 0 ||
    selected.size !== domains.length ||
    new Set(domains.map(({ name }) => name)).size !== domains.length ||
    quote.items.length === 0 ||
    items.size !== quote.items.length ||
    quote.items.some(
      ({ domain }) =>
        selected.get(domain.id.toLowerCase())?.name !== domain.name,
    )
  ) {
    throw new Error('The renewal quote no longer matches your selection.')
  }

  return domains.map((domain) => {
    const item = items.get(domain.id.toLowerCase())
    if (!item) return domain
    const owner = item.domain.wrappedOwner?.id ?? item.domain.registrant?.id
    if (
      !owner ||
      isAddressEqual(quote.ownerAddress, zeroAddress) ||
      !isAddressEqual(owner as Address, quote.ownerAddress)
    ) {
      throw new Error('The renewal quote no longer matches your wallet.')
    }
    if (
      item.duration < 0n ||
      item.targetExpiry !== item.registrationExpiry + item.duration ||
      item.targetExpiry <= BigInt(Math.floor(Date.now() / 1000))
    ) {
      throw new Error('The renewal quote expired. Refresh the estimate.')
    }
    if (item.duration === 0n) return item.domain
    return {
      ...item.domain,
      registration: { expiryDate: item.targetExpiry.toString() },
      wrappedDomain: item.domain.wrappedDomain
        ? {
            ...item.domain.wrappedDomain,
            expiryDate: (item.targetExpiry + GRACE_PERIOD).toString(),
          }
        : null,
    }
  })
}

const estimateProjectedMigration = async (
  params: Params,
  domains: readonly V1Domain[],
) => {
  const { quote, hcaAddress, publicClient, wagmiConfig, signal } = params
  const managerRestorationNames = params.managerRestorationNames ?? []
  // Projected expiries must not share the executable preflight cache.
  const preflight = await computeMigrationPreflight({
    eoa: quote.ownerAddress,
    hcaAddress,
    domains,
    requiresManagerRestoration: managerRestorationNames.length > 0,
    publicClient,
    wagmiConfig,
    signal,
  })
  signal?.throwIfAborted()
  const plan = await buildMigrationPlan({
    domains,
    hcaAddress,
    migrationOwner: quote.ownerAddress,
    managerRestorationNames,
    publicClient,
    preflight,
    signal,
  })
  signal?.throwIfAborted()
  const included = new Map(
    plan.classified.map(({ domain }) => [domain.id.toLowerCase(), domain.name]),
  )
  if (
    plan.classified.length !== domains.length ||
    included.size !== domains.length ||
    domains.some(({ id, name }) => included.get(id.toLowerCase()) !== name)
  ) {
    throw new Error(
      'Could not estimate the network fee for every selected name.',
    )
  }
  const estimate = await estimateMigrationGasCost({ plan, publicClient })
  if (estimate.status === 'error') throw estimate.error
  return { ...estimate, stepDescriptors: plan.stepDescriptors }
}

/** Projects renewal only for fee display; executable plans are rebuilt after renewal. */
export const estimateGraceRenewalMigrationGas = async (
  params: Params,
): Promise<GraceRenewalMigrationGasEstimate> => {
  params.signal?.throwIfAborted()
  const domains = projectSelectedDomains(params)
  const [migration, renewal] = await Promise.all([
    estimateProjectedMigration(params, domains),
    estimateGraceRenewalGas({
      quote: params.quote,
      publicClient: params.publicClient,
      signal: params.signal,
    }),
  ])
  params.signal?.throwIfAborted()
  assertQuoteFresh(params.quote)
  const gasUnits = migration.gasUnits + renewal.gasUnits
  const stepDescriptors: MigrationWalletRequestDescriptor[] = []
  if (renewal.approvalRequired) {
    stepDescriptors.push({ type: 'renewal-approval' })
  }
  if (renewal.transactionCount > 0) {
    stepDescriptors.push({
      type: 'renew-grace',
      count: params.quote.items.filter(({ duration }) => duration > 0n).length,
    })
  }
  stepDescriptors.push(...migration.stepDescriptors)
  return {
    gasUnits,
    feeWei: gasUnits * migration.feePerGasWei,
    transactionCount: migration.transactionCount + renewal.transactionCount,
    stepDescriptors,
  }
}
