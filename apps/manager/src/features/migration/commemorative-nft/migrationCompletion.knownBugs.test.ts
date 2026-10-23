import { Storage } from 'happy-dom'
import { ok } from 'neverthrow'
import { type Address, type Hex, namehash } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'

const mocks = vi.hoisted(() => ({
  getPublicClient: vi.fn(),
  getV1NamesForAddress: vi.fn(),
  getMigratedNamesCount: vi.fn(),
  runEligibilityChecks: vi.fn(),
  restoreCheckpoint: vi.fn(),
}))

vi.mock('../service/migrationCompletionCheckpoint', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../service/migrationCompletionCheckpoint')
  >()),
  restoreMigrationCompletionCheckpoint: mocks.restoreCheckpoint,
}))
vi.mock('./diagnostics', () => ({ trackNftEvent: vi.fn() }))
vi.mock('@wagmi/core', () => ({ getPublicClient: mocks.getPublicClient }))
vi.mock('../service/v1Names', () => ({
  getV1NamesForAddress: mocks.getV1NamesForAddress,
}))
vi.mock('../service/getMigratedNamesCount', () => ({
  getMigratedNamesCount: mocks.getMigratedNamesCount,
}))
vi.mock('../service/preflightChecks', () => ({
  runEligibilityChecks: mocks.runEligibilityChecks,
}))

import { makeDomain } from '../service/_fixtures'
import { classifyNames } from '../service/classifyNames'
import {
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
} from '../service/migrationBatchJournal'
import {
  type CommemorativeNftMigrationCompletionParams,
  fetchCommemorativeNftMigrationCompletion,
} from './migrationCompletion'

const ownerAddress = '0x0000000000000000000000000000000000000001' as Address
const hcaAddress = '0x0000000000000000000000000000000000000002' as Address
const params: CommemorativeNftMigrationCompletionParams = {
  ownerAddress,
  hcaAddress,
  chainId: sepolia.id,
  wagmiConfig: {} as CommemorativeNftMigrationCompletionParams['wagmiConfig'],
}
const scope = { owner: ownerAddress, hca: hcaAddress, chainId: sepolia.id }
const domain = makeDomain({
  id: namehash('alice.eth'),
  name: 'alice.eth',
  labelName: 'alice',
})
const { classified } = classifyNames([domain], ownerAddress, envConfig.chain.id)
const operations = [{ name: 'alice.eth', action: 'migrate' as const }]

const journalStale = {
  pending: () =>
    persistPendingAtomicMigrationIntent(scope, {
      id: 'stale-alice',
      names: ['alice.eth'],
      operations,
    }),
  submitted: () =>
    persistSubmittedAtomicMigrationBatch(scope, {
      intentId: 'stale-alice',
      hash: `0x${'1'.repeat(64)}` as Hex,
      names: ['alice.eth'],
      operations,
    }),
} as const

beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage())
  vi.resetAllMocks()
  mocks.restoreCheckpoint.mockResolvedValue(null)
  mocks.getPublicClient.mockReturnValue({ chain: { id: sepolia.id } })
  mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
  mocks.getMigratedNamesCount.mockResolvedValue(ok(1))
  mocks.runEligibilityChecks.mockResolvedValue({
    eligible: [],
    frozen: [],
    alreadyMigrated: classified,
    notPremigrated: [],
    failed: [],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('migrationCompletion known bugs (WEB-1942)', () => {
  // Direct-only plans never clear a journal entry for a name that left the fresh plan, so completion counts it as remaining forever. Remove .fails when fixed.
  it.fails.each(['pending', 'submitted'] as const)(
    'WEB-1942 #8: reports complete once a stale %s journal name is verified migrated on chain',
    async (state) => {
      journalStale[state]()

      await expect(
        fetchCommemorativeNftMigrationCompletion(params),
      ).resolves.toMatchObject({
        status: 'complete',
        isComplete: true,
        remainingNameCount: 0,
      })
    },
  )
})
