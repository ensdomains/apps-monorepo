import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { createPublicClient, createWalletClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '@/features/profile/utils/transformRecords'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import {
  getSaveRecordsMutationOptions,
  getSetupResolverMutationOptions,
} from './editProfileSave.mutations'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  bind: vi.fn(),
  saveRecords: vi.fn(),
  setupControlledResolver: vi.fn(),
}))
vi.mock('@/lib/posthog/events', () => ({
  startAnalyticsOperation: mocks.bind,
}))
vi.mock('@/features/profile/service/profileRecordTransactions', () => ({
  saveRecords: mocks.saveRecords,
}))
vi.mock('@/features/profile/service/setupControlledResolver', () => ({
  setupControlledResolver: mocks.setupControlledResolver,
}))

const OWNER = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x3333333333333333333333333333333333333333'
const publicClient = createPublicClient({ chain: sepolia, transport: http() })
const walletClient = createWalletClient({
  account: OWNER,
  chain: sepolia,
  transport: http(),
})

const run = (route: 'update' | 'setup') => {
  let confirm = () => {}
  let reject = () => {}
  const operation = new Promise((resolve, fail) => {
    confirm = () =>
      resolve(
        route === 'update' ? { txId: 'records-tx', hash: '0x1234' } : RESOLVER,
      )
    reject = () => fail(new Error('Record write failed'))
  })
  mocks.saveRecords.mockReturnValue(operation)
  mocks.setupControlledResolver.mockReturnValue(operation)
  const records: ProfileRecords = {
    ...defaultProfileRecords,
    resolverAddress: RESOLVER,
  }
  const actor = createActor(editProfileDialogMachine, {
    input: { name: 'alice.eth', records },
  }).start()
  actor.send({ type: 'OPEN', name: 'alice.eth', records })
  actor.send({
    type: 'SAVE_REQUESTED',
    values: records,
    deps: {
      name: 'alice.eth',
      chainId: sepolia.id,
      owner: OWNER,
      ownerAddress: OWNER,
      publicClient,
      walletClient,
      needsResolverSetup: route === 'setup',
      recordReview: { editedKeys: [], writes: [] },
    },
  })
  const pending = actor.getSnapshot().context.pendingSave
  if (!pending) throw new Error('Missing pending save')
  const client = new QueryClient()
  const outcome =
    pending.kind === 'update'
      ? new MutationObserver(client, getSaveRecordsMutationOptions()).mutate({
          ...pending.params,
          currentRecords: pending.currentRecords,
        })
      : new MutationObserver(client, getSetupResolverMutationOptions()).mutate({
          pendingSave: pending,
        })
  return {
    actor,
    confirm,
    reject,
    outcome: outcome.then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bind.mockReturnValue({ capture: mocks.capture })
})

describe('profile record mutation outcomes', () => {
  it.each([
    ['update', 'confirm'],
    ['setup', 'confirm'],
    ['update', 'reject'],
    ['setup', 'reject'],
  ] as const)(
    'reports only confirmed %s records after dialog stop (%s)',
    async (route, outcome) => {
      const save = run(route)
      await vi.waitFor(() =>
        expect(
          route === 'update'
            ? mocks.saveRecords
            : mocks.setupControlledResolver,
        ).toHaveBeenCalledOnce(),
      )
      save.actor.stop()
      const laterCapture = vi.fn()
      mocks.bind.mockReturnValue({ capture: laterCapture })
      save[outcome]()
      expect(await save.outcome).toEqual(
        outcome === 'reject' ? new Error('Record write failed') : undefined,
      )
      expect(mocks.capture.mock.calls).toEqual(
        outcome === 'confirm'
          ? [['profile:records_update', { chain_id: sepolia.id }]]
          : [],
      )
      expect(laterCapture).not.toHaveBeenCalled()
    },
  )
})
