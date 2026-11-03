import type { V1Domain } from '@ens-apps/migration'
import type { Address, PublicClient } from 'viem'
import {
  buildMigrationPlan,
  buildMigrationRecoveryPlan,
  MigrationRecoveryPlanError,
} from './buildMigrationPlan'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type { MigrationRecoverySnapshot } from './migrationBatchJournal'
import type { MigrationEstimateObserver } from './migrationEstimateProgress'
import { runMigrationPreparationStage } from './migrationPreparationError'
import type { RpcSubnameInventory } from './readRpcSubnameInventory'
import {
  assertSupportedSubnameMigration,
  discoverSubnameRecreation,
} from './subnameRecreation'
import type { UpgradeReadCoordinator } from './upgradeReadCoordinator'

type PrepareUpgradeParameters = {
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
      readonly publicClient?: PublicClient
      readonly verificationClient?: PublicClient
      readonly requiresManagerRestoration: boolean
      readonly requiresRegistryConfiguration: boolean
      readonly onNamesRead?: (names: readonly string[]) => void | Promise<void>
    },
  ) => Promise<MigrationPreflight>
  readonly coordinator?: UpgradeReadCoordinator
  readonly verificationClient?: PublicClient
}

const prepareWithReads = async (params: PrepareUpgradeParameters) => {
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
  const [discovery, preflight] = await Promise.all([
    params.shouldRecreateSubnames
      ? runMigrationPreparationStage('plan', () =>
          discoverSubnameRecreation({
            onNamesChecked: (names) => report('checking-names', names),
            domains: params.domains,
            owner: ownerAddress,
            publicClient,
            verificationClient: params.verificationClient,
            inventory: params.inventory,
            signal: params.signal,
          }),
        )
      : Promise.resolve(undefined),
    runMigrationPreparationStage('preflight', async () => {
      await report('finding-records')
      return params.ensurePreflight(params.domains, {
        signal: params.signal,
        staleTime: 0,
        ...(params.verificationClient && {
          publicClient,
          verificationClient: params.verificationClient,
        }),
        onNamesRead: (names) => report('finding-records', names),
        requiresManagerRestoration: params.managerRestorationNames.length > 0,
        requiresRegistryConfiguration: false,
      })
    }),
  ])
  params.signal.throwIfAborted()
  if (discovery) await params.onInventory?.(discovery.inventory)
  const recreation = discovery?.snapshot.roots.length ? discovery : undefined
  await report('checking-names', selectedNames)
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
      verificationClient: params.verificationClient,
      preflight,
      onProgress: params.onProgress,
      canBatchAtomically: params.canBatchAtomically,
      signal: params.signal,
    }),
  )
  params.signal.throwIfAborted()
  await report('checking-upgrade')
  const [subnameImpact, estimate] = await Promise.all([
    runMigrationPreparationStage('plan', async () => {
      const impact = await assertSupportedSubnameMigration({
        publicClient,
        verificationClient: params.verificationClient,
        classified: plan.classified,
        inventory: discovery?.inventory,
        unknownLabelNames: discovery?.unrecoverable,
        signal: params.signal,
      })
      await report('checking-upgrade', selectedNames)
      await report('checking-fee')
      return impact
    }),
    runMigrationPreparationStage('fee', async () => {
      const result = await estimateMigrationGasCost({ plan, publicClient })
      if (result.status === 'error') throw result.error
      return result
    }),
  ])
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

/** One preparation lifetime; independent producers share the coordinator's read queue. */
export const prepareUpgrade = (params: PrepareUpgradeParameters) =>
  params.coordinator && params.ownerAddress && params.publicClient
    ? params.coordinator.run(
        { owner: params.ownerAddress, signal: params.signal },
        (clients) => prepareWithReads({ ...params, ...clients }),
      )
    : prepareWithReads(params)
