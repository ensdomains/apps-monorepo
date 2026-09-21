// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: this hook keeps standard preview, durable recovery, account readiness, and query result states in one stable hook order.
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, formatEther, type PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  buildMigrationPlan,
  buildMigrationRecoveryPlan,
  type MigrationPlan,
  MigrationRecoveryPlanError,
} from '@/features/migration/service/buildMigrationPlan'
import type { MigrationPreflight } from '@/features/migration/service/computeMigrationPreflight'
import { estimateMigrationGasCost } from '@/features/migration/service/estimateMigrationGasCost'
import type { MigrationRecoverySnapshot } from '@/features/migration/service/migrationBatchJournal'
import {
  type MigrationPreparationFailure,
  migrationPreparationFailure,
  runMigrationPreparationStage,
} from '@/features/migration/service/migrationPreparationError'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useMigrationPreflight } from './useMigrationPreflight'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

export type MigrationGasEstimateState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      readonly formattedEth: string
      readonly gasUnits: bigint
      readonly feeWei: bigint
      readonly transactionCount: number
      readonly plan: MigrationPlan
    }
  | ({ readonly status: 'error' } & MigrationPreparationFailure)

type UseMigrationGasEstimateParams = {
  readonly ownerAddress: Address | undefined
  readonly hcaAddress: Address | undefined
  readonly accountError?: string | null
  readonly selectedNames: readonly string[]
  readonly v1Names: readonly V1Domain[]
  readonly enabled?: boolean
}

const GAS_ESTIMATE_QUIET_PERIOD_MS = 200

const selectDomainsFromNames = (
  v1Names: readonly V1Domain[],
  selectedNames: ReadonlySet<string>,
): V1Domain[] => {
  return v1Names.filter((domain) => selectedNames.has(domain.name))
}

const waitForStableSelection = (signal: AbortSignal): Promise<void> => {
  signal.throwIfAborted()

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, GAS_ESTIMATE_QUIET_PERIOD_MS)
    const handleAbort = () => {
      clearTimeout(timeoutId)
      reject(signal.reason)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

const formatEstimatedEth = (wei: bigint): string => {
  const formatted = formatEther(wei)
  const [whole = '0', fraction = ''] = formatted.split('.')
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, '')
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole
}

const buildEstimate = async (params: {
  readonly ownerAddress: Address | undefined
  readonly hcaAddress: Address | undefined
  readonly publicClient: PublicClient | undefined
  readonly recoverySnapshot: MigrationRecoverySnapshot | null
  readonly recoverySelectionMatches: boolean
  readonly domains: readonly V1Domain[]
  readonly signal: AbortSignal
  readonly ensurePreflight: (
    domains: readonly V1Domain[],
    options: {
      readonly signal: AbortSignal
      readonly staleTime: number
    },
  ) => Promise<MigrationPreflight>
}) => {
  const { ownerAddress, hcaAddress, publicClient } = params
  params.signal.throwIfAborted()
  if (!ownerAddress || !hcaAddress || !publicClient) {
    return runMigrationPreparationStage('account', () =>
      Promise.reject(new Error('Account setup incomplete')),
    )
  }
  const recoverySnapshot = params.recoverySnapshot
  if (recoverySnapshot) {
    if (!params.recoverySelectionMatches) {
      return runMigrationPreparationStage('recovery', () =>
        Promise.reject(
          new MigrationRecoveryPlanError({
            message: 'Select every remaining name to continue your upgrade.',
            reason: 'operation-mismatch',
          }),
        ),
      )
    }
    const plan = await runMigrationPreparationStage('recovery', () =>
      buildMigrationRecoveryPlan({
        snapshot: recoverySnapshot,
        hcaAddress,
        migrationOwner: ownerAddress,
        publicClient,
        signal: params.signal,
      }),
    )
    params.signal.throwIfAborted()
    const estimate = await runMigrationPreparationStage('fee', async () => {
      const result = await estimateMigrationGasCost({ plan, publicClient })
      if (result.status === 'error') throw result.error
      return result
    })
    params.signal.throwIfAborted()
    return { estimate, plan }
  }
  const preflight = await runMigrationPreparationStage('preflight', () =>
    params.ensurePreflight(params.domains, {
      signal: params.signal,
      staleTime: 0,
    }),
  )
  params.signal.throwIfAborted()
  const plan = await runMigrationPreparationStage('plan', () =>
    buildMigrationPlan({
      domains: params.domains,
      hcaAddress,
      migrationOwner: ownerAddress,
      publicClient,
      preflight,
      signal: params.signal,
    }),
  )
  params.signal.throwIfAborted()
  const estimate = await runMigrationPreparationStage('fee', async () => {
    const result = await estimateMigrationGasCost({ plan, publicClient })
    if (result.status === 'error') throw result.error
    return result
  })
  params.signal.throwIfAborted()
  return { estimate, plan }
}

export const useMigrationGasEstimate = ({
  ownerAddress,
  hcaAddress,
  accountError,
  selectedNames,
  v1Names,
  enabled: estimateEnabled = true,
}: UseMigrationGasEstimateParams): MigrationGasEstimateState => {
  const publicClient = usePublicClient()
  const { ensure: ensurePreflight } = useMigrationPreflight({
    eoa: ownerAddress,
    hcaAddress,
  })
  const recoverySnapshot = useMigrationRecoverySnapshot()

  const selectedNameSet = useMemo(() => new Set(selectedNames), [selectedNames])
  const selectedNamesKey = useMemo(
    () => [...selectedNames].sort(),
    [selectedNames],
  )
  const domains = useMemo(
    () =>
      recoverySnapshot
        ? recoverySnapshot.registryDomains
        : selectDomainsFromNames(v1Names, selectedNameSet),
    [recoverySnapshot, selectedNameSet, v1Names],
  )
  const domainIds = useMemo(
    () => domains.map((domain) => domain.id).sort(),
    [domains],
  )
  const recoveryOperations = useMemo(
    () =>
      recoverySnapshot?.remainingOperations.map(
        ({ name, action }) => `${action}:${name}`,
      ) ?? [],
    [recoverySnapshot],
  )
  const enabled =
    estimateEnabled &&
    !!ownerAddress &&
    !!hcaAddress &&
    !!publicClient &&
    selectedNames.length > 0 &&
    domains.length > 0
  const recoverySelectionMatches =
    !recoverySnapshot ||
    (selectedNames.length === recoverySnapshot.remainingOperations.length &&
      recoverySnapshot.remainingOperations.every(({ name }) =>
        selectedNameSet.has(name),
      ))

  const query = useQuery({
    queryKey: [
      'migration-gas-estimate',
      {
        ownerAddress: ownerAddress?.toLowerCase() ?? '',
        hcaAddress: hcaAddress?.toLowerCase() ?? '',
        domainIds,
        selectedNames: selectedNamesKey,
        recoveryOperations,
      },
    ] as const,
    enabled,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      await waitForStableSelection(signal)
      return buildEstimate({
        ownerAddress,
        hcaAddress,
        publicClient: publicClient as unknown as PublicClient | undefined,
        recoverySnapshot,
        recoverySelectionMatches,
        domains,
        ensurePreflight,
        signal,
      })
    },
  })

  if (!enabled) {
    if (selectedNames.length > 0 && accountError) {
      return {
        status: 'error',
        ...migrationPreparationFailure(accountError, 'account'),
      }
    }
    if (
      selectedNames.length > 0 &&
      domains.length > 0 &&
      ownerAddress &&
      publicClient &&
      !hcaAddress
    ) {
      return { status: 'loading' }
    }
    return { status: 'idle' }
  }
  if (query.isPending || query.isFetching) return { status: 'loading' }
  if (query.isError)
    return { status: 'error', ...migrationPreparationFailure(query.error) }
  if (!query.data) return { status: 'idle' }

  return {
    status: 'ready',
    formattedEth: formatEstimatedEth(query.data.estimate.feeWei),
    gasUnits: query.data.estimate.gasUnits,
    feeWei: query.data.estimate.feeWei,
    transactionCount: query.data.estimate.transactionCount,
    plan: query.data.plan,
  }
}
