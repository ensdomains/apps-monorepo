// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: this hook keeps standard preview, durable recovery, account readiness, and query result states in one stable hook order.

import type { V1Domain } from '@ens-apps/migration'
import { useAtomicBatchSupport } from '@ens-apps/transaction-manager'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, formatEther, type PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import { chain } from '@/config'
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
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { V1_CONTRACTS } from '../contracts/addresses'
import type {
  MigrationEstimateObserver,
  MigrationEstimateProgress,
} from '../service/migrationEstimateProgress'
import type { RpcSubnameInventory } from '../service/readRpcSubnameInventory'
import {
  getReusableRpcSubnameInventory,
  getRpcSubnameInventoryCacheKey,
} from '../service/rpcSubnameInventoryCache'
import { publishPreparedSubnameImpact } from '../service/subnameMigrationImpactQuery'
import {
  assertSupportedSubnameMigration,
  discoverSubnameRecreation,
} from '../service/subnameRecreation'
import { useMigrationEstimateProgress } from './useMigrationEstimateProgress'
import { useMigrationPreflight } from './useMigrationPreflight'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

export type MigrationGasEstimateState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'loading'
      readonly progress?: MigrationEstimateProgress
    }
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
  /** Names whose ENSv1 registry controller the owner chose to keep as manager. */
  readonly managerRestorationNames?: readonly string[]
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
  readonly shouldRecreateSubnames: boolean
  readonly managerRestorationNames: readonly string[]
  readonly canBatchAtomically: boolean
  readonly signal: AbortSignal
  readonly onProgress: MigrationEstimateObserver
  readonly inventory?: RpcSubnameInventory
  readonly onInventory?: (
    inventory: RpcSubnameInventory,
  ) => void | Promise<void>
  readonly ensurePreflight: (
    domains: readonly V1Domain[],
    options: {
      readonly signal: AbortSignal
      readonly staleTime: number
      readonly requiresManagerRestoration: boolean
      readonly requiresRegistryConfiguration: boolean
      readonly onNamesRead?: (names: readonly string[]) => void | Promise<void>
    },
  ) => Promise<MigrationPreflight>
}) => {
  const { ownerAddress, hcaAddress, publicClient } = params
  const selectedNames = params.domains.map(({ name }) => name)
  const report = async (
    stage: Parameters<MigrationEstimateObserver>[0]['stage'],
    names: readonly string[] = [],
  ) => {
    params.signal.throwIfAborted()
    await params.onProgress({ stage, names })
    params.signal.throwIfAborted()
  }
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
        canBatchAtomically: params.canBatchAtomically,
        signal: params.signal,
        onProgress: params.onProgress,
      }),
    )
    params.signal.throwIfAborted()
    await report('checking-fee')
    const estimate = await runMigrationPreparationStage('fee', async () => {
      const result = await estimateMigrationGasCost({ plan, publicClient })
      if (result.status === 'error') throw result.error
      return result
    })
    params.signal.throwIfAborted()
    await report('checking-fee', selectedNames)
    return {
      estimate,
      plan: {
        ...plan,
        isSubnameRecreationEnabled: params.shouldRecreateSubnames,
      },
    }
  }
  const discovery = params.shouldRecreateSubnames
    ? await runMigrationPreparationStage('plan', () =>
        discoverSubnameRecreation({
          onNamesChecked: (names) => report('checking-names', names),
          domains: params.domains,
          owner: ownerAddress,
          publicClient,
          inventory: params.inventory,
          signal: params.signal,
        }),
      )
    : undefined
  params.signal.throwIfAborted()
  if (discovery) await params.onInventory?.(discovery.inventory)
  const recreation = discovery?.snapshot.roots.length ? discovery : undefined
  await report('checking-names', selectedNames)
  await report('finding-records')
  const preflight = await runMigrationPreparationStage('preflight', () =>
    params.ensurePreflight(params.domains, {
      signal: params.signal,
      staleTime: 0,
      onNamesRead: (names) => report('finding-records', names),
      requiresManagerRestoration: params.managerRestorationNames.length > 0,
      requiresRegistryConfiguration: false,
    }),
  )
  params.signal.throwIfAborted()
  await report('finding-records', selectedNames)
  const plan = await runMigrationPreparationStage('plan', () =>
    buildMigrationPlan({
      domains: recreation?.domains ?? params.domains,
      subnameRecreation: recreation
        ? { snapshot: recreation.snapshot }
        : undefined,
      hcaAddress,
      migrationOwner: ownerAddress,
      managerRestorationNames: params.managerRestorationNames,
      publicClient,
      preflight,
      onProgress: params.onProgress,
      canBatchAtomically: params.canBatchAtomically,
      signal: params.signal,
    }),
  )
  params.signal.throwIfAborted()
  await report('checking-upgrade')
  const subnameImpact = await runMigrationPreparationStage('plan', () =>
    assertSupportedSubnameMigration({
      publicClient,
      ownerAddress,
      classified: plan.classified,
      inventory: discovery?.inventory,
      signal: params.signal,
    }),
  )
  await report('checking-upgrade', selectedNames)
  await report('checking-fee')
  const estimate = await runMigrationPreparationStage('fee', async () => {
    const result = await estimateMigrationGasCost({ plan, publicClient })
    if (result.status === 'error') throw result.error
    return result
  })
  params.signal.throwIfAborted()
  await report('checking-fee', selectedNames)
  return {
    estimate,
    subnameImpact,
    plan: {
      ...plan,
      isSubnameRecreationEnabled: params.shouldRecreateSubnames,
    },
  }
}

export const useMigrationGasEstimate = ({
  ownerAddress,
  hcaAddress,
  accountError,
  selectedNames,
  managerRestorationNames,
  v1Names,
  enabled: estimateEnabled = true,
}: UseMigrationGasEstimateParams): MigrationGasEstimateState => {
  // Roll out the reviewed-snapshot import independently of ordinary migration.
  const queryClient = useQueryClient()
  const helperFlag = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
    false,
  )
  const shouldRecreateSubnames = helperFlag === true
  const publicClient = usePublicClient({ chainId: chain.id })
  const { ensure: ensurePreflight } = useMigrationPreflight({
    eoa: ownerAddress,
    hcaAddress,
  })
  const recoverySnapshot = useMigrationRecoverySnapshot()
  const canBatchAtomically = useAtomicBatchSupport(chain.id)

  const selectedNameSet = useMemo(() => new Set(selectedNames), [selectedNames])
  const selectedNamesKey = useMemo(
    () => [...selectedNames].sort(),
    [selectedNames],
  )
  // A per-name opt-in changes the calls inside the batch, so it has to key the
  // estimate the same way the selection does.
  const managerRestorationKey = useMemo(
    () => [...(managerRestorationNames ?? [])].sort(),
    [managerRestorationNames],
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
    (selectedNames.length > 0 || !!recoverySnapshot) &&
    domains.length > 0
  const recoverySelectionMatches =
    !recoverySnapshot ||
    (recoverySnapshot.remainingOperations.every(
      ({ name }) =>
        selectedNameSet.has(name) ||
        recoverySnapshot.subnameRecreation?.roots.some(
          (root) => selectedNameSet.has(root) && name.endsWith(`.${root}`),
        ),
    ) &&
      selectedNames.every((name) =>
        recoverySnapshot.remainingOperations.some(
          (operation) => operation.name === name,
        ),
      ))

  const queryKey = [
    'migration-gas-estimate',
    {
      shouldRecreateSubnames,
      ownerAddress: ownerAddress?.toLowerCase() ?? '',
      hcaAddress: hcaAddress?.toLowerCase() ?? '',
      domainIds,
      selectedNames: selectedNamesKey,
      managerRestorationNames: managerRestorationKey,
      recoveryOperations,
      canBatchAtomically,
    },
  ] as const
  const { progress, start: startProgress } = useMigrationEstimateProgress(
    queryKey,
    selectedNamesKey,
  )
  const query = useQuery({
    queryKey,
    enabled,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      await waitForStableSelection(signal)
      const progressHandlers = startProgress(signal)
      const inventoryKey = ownerAddress
        ? getRpcSubnameInventoryCacheKey({
            ownerAddress,
            chainId: chain.id,
            registryAddress: V1_CONTRACTS.LegacyRegistry,
            nameWrapperAddress: V1_CONTRACTS.NameWrapper,
          })
        : undefined
      const inventory = getReusableRpcSubnameInventory({
        inventory: inventoryKey
          ? queryClient.getQueryData<RpcSubnameInventory>(inventoryKey)
          : undefined,
        chainId: chain.id,
        registryAddress: V1_CONTRACTS.LegacyRegistry,
        nameWrapperAddress: V1_CONTRACTS.NameWrapper,
        names: domains.map(({ name }) => name),
      })
      const prepared = await buildEstimate({
        ...progressHandlers,
        ownerAddress,
        hcaAddress,
        publicClient: publicClient as unknown as PublicClient | undefined,
        recoverySnapshot,
        recoverySelectionMatches,
        shouldRecreateSubnames,
        domains,
        managerRestorationNames: managerRestorationKey,
        canBatchAtomically,
        ensurePreflight,
        inventory,
        onInventory: inventoryKey
          ? (value) => {
              signal.throwIfAborted()
              queryClient.setQueryData(inventoryKey, value)
            }
          : undefined,
        signal,
      })
      if (
        'subnameImpact' in prepared &&
        prepared.subnameImpact &&
        ownerAddress
      ) {
        publishPreparedSubnameImpact({
          queryClient,
          ownerAddress,
          chainId: chain.id,
          migratingNames: prepared.plan.classified
            .filter((name) => name.action === 'migrate')
            .map(({ domain }) => domain.name),
          copiedNames: prepared.plan.classified
            .filter((name) => name.action === 'copy')
            .map(({ domain }) => domain.name),
          renewingNames: [],
          impact: prepared.subnameImpact,
        })
      }
      return prepared
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
      return { status: 'loading', ...(progress && { progress }) }
    }
    return { status: 'idle' }
  }
  if (query.isPending || query.isFetching)
    return { status: 'loading', ...(progress && { progress }) }
  if (query.isError)
    return { status: 'error', ...migrationPreparationFailure(query.error) }
  if (!query.data) return { status: 'idle' }

  return {
    status: 'ready',
    formattedEth: formatEstimatedEth(query.data.estimate.feeWei),
    gasUnits: query.data.estimate.gasUnits,
    feeWei: query.data.estimate.feeWei,
    transactionCount: query.data.estimate.transactionCount,
    plan: {
      ...query.data.plan,
      isSubnameRecreationEnabled: shouldRecreateSubnames,
    },
  }
}
