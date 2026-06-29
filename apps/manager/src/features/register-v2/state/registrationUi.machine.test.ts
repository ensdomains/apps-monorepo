// biome-ignore-all lint/suspicious/noExplicitAny: focused machine tests use compact fixtures
import type { Address } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assign, createActor, createMachine } from 'xstate'

vi.mock('@ens-apps/transaction-manager', () => ({
  registrationMachine: createMachine({
    id: 'registrationStub',
    context: {
      resolverAddress: undefined as Address | undefined,
      resolverTxId: 'tx-resolver',
      commitmentTxId: 'tx-commit',
      approvalTxId: 'tx-approve',
      registrationTxId: 'tx-register',
      registerReadyTimestamp: null as number | null,
      error: undefined as Error | undefined,
      retryCount: 0,
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          START_REGISTRATION: 'running',
          RETRY: {
            actions: assign({
              retryCount: ({ context }) => context.retryCount + 1,
            }),
          },
        },
      },
      running: {
        on: {
          FORCE_SUCCESS: {
            target: 'success',
            actions: assign({
              resolverAddress: () =>
                '0x9999999999999999999999999999999999999999' as Address,
            }),
          },
          FORCE_ERROR: {
            target: 'error',
            actions: assign({
              error: ({ event }) => event.error as Error,
            }),
          },
          RETRY: {
            actions: assign({
              retryCount: ({ context }) => context.retryCount + 1,
            }),
          },
        },
      },
      success: {},
      error: {},
    },
  }),
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))

vi.mock('../service/syncEthAddressRecord', () => ({
  startSyncEthAddressRecordTransaction: vi.fn(async () => 'tx-eth-record'),
}))

vi.mock('../../profile/service/setPrimaryName', () => ({
  needsSignatureFlow: vi.fn(() => false),
  startSmartPrimaryNameTransaction: vi.fn(async () => 'tx-primary-smart'),
  submitPrimaryNameForward: vi.fn(() => 'tx-primary-forward'),
  submitPrimaryNameReverse: vi.fn(() => 'tx-primary-reverse'),
}))

vi.mock('@/features/register/components/Pricing/utils', () => ({
  MIN_REGISTER_DURATION_SECONDS: 2_419_200,
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: { chain: { id: 11155111 } },
}))

vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => undefined,
}))

import { waitForTransaction } from '@ens-apps/transaction-manager'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import {
  needsSignatureFlow,
  startSmartPrimaryNameTransaction,
  submitPrimaryNameForward,
  submitPrimaryNameReverse,
} from '../../profile/service/setPrimaryName'
import { startSyncEthAddressRecordTransaction } from '../service/syncEthAddressRecord'
import {
  getRegistrationV2ChildActor,
  registrationV2UiMachine,
} from './registrationUi.machine'

const waitForKnownTransaction = vi.mocked(waitForTransaction)
const startSyncEthRecord = vi.mocked(startSyncEthAddressRecordTransaction)
const isSmartFlow = vi.mocked(needsSignatureFlow)
const startSmartPrimaryName = vi.mocked(startSmartPrimaryNameTransaction)
const startPrimaryNameForward = vi.mocked(submitPrimaryNameForward)
const startPrimaryNameReverse = vi.mocked(submitPrimaryNameReverse)

const HCA_ADDRESS = '0x1111111111111111111111111111111111111111' as const
const EOA_ADDRESS = '0x2222222222222222222222222222222222222222' as const

const startEvent = (
  account: SmartAccountContextValue,
  setup:
    | false
    | {
        enabled: boolean
        syncEthRecord?: boolean
      } = false,
) =>
  ({
    type: 'registration.start' as const,
    label: 'example',
    duration: 31_536_000n,
    token: 'USDC',
    totalPrice: 1_000_000n,
    account,
    basePriceNumber: 1,
    premiumPriceNumber: 0,
    postRegistrationSetup: setup
      ? {
          primaryName: {
            enabled: setup.enabled,
            syncEthRecord: setup.syncEthRecord,
          },
        }
      : undefined,
  }) as const

const startActorInTokens = () => {
  const actor = createActor(registrationV2UiMachine, {
    input: { chainId: 11155111 },
  })
  actor.start()
  actor.send({ type: 'pricing.step.next' })
  return actor
}

const getChild = (actor: ReturnType<typeof startActorInTokens>) => {
  const child = getRegistrationV2ChildActor(actor.getSnapshot())
  if (!child) throw new Error('registration child actor missing')
  return child
}

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
  }
}

afterEach(() => {
  vi.clearAllMocks()
  isSmartFlow.mockReturnValue(false)
})

describe('registrationV2UiMachine — HCA approval-signer guard', () => {
  it('fails fast when an HCA registration has no owner wallet client', () => {
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('failure')
    expect(snapshot.context.lastErrorMessage).toMatch(/reconnect your wallet/i)
  })

  it('proceeds when an HCA registration has an owner wallet client', () => {
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: { account: { address: EOA_ADDRESS } } as any,
      } as unknown as SmartAccountContextValue),
    )

    expect(actor.getSnapshot().matches('registering')).toBe(true)
  })

  it('does not fail fast for a pure-EOA registration without a wallet client', () => {
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'eoa' } as any,
        accountAddress: EOA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    expect(actor.getSnapshot().matches('registering')).toBe(true)
  })
})

describe('registrationV2UiMachine — explicit post-registration states', () => {
  const eoaAccount = {
    signer: { type: 'eoa', walletClient: {} as never },
    accountAddress: EOA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: null,
  } as unknown as SmartAccountContextValue

  const smartAccount = {
    signer: {
      type: 'rhinestone',
      account: {} as never,
      config: { accountAddress: HCA_ADDRESS, rhinestoneApiKey: 'k' },
    },
    accountAddress: HCA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: { account: { address: EOA_ADDRESS } } as any,
  } as unknown as SmartAccountContextValue

  it('keeps the existing no-setup success path immediate', async () => {
    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount))

    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush()

    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(startSyncEthRecord).not.toHaveBeenCalled()
  })

  it('enters explicit post-registration states when setup exists', async () => {
    const ethSubmit = deferred<string>()
    startSyncEthRecord.mockReturnValueOnce(ethSubmit.promise)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: false }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush()

    expect(
      actor
        .getSnapshot()
        .matches({ registering: { transaction: 'settingPrimaryNameForward' } }),
    ).toBe(true)
    expect(startSyncEthRecord).not.toHaveBeenCalled()
  })

  it('stores the ETH record tx id before waiting for confirmation', async () => {
    const wait = deferred<{ hash: '0xhash' }>()
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction.mockReturnValueOnce(wait.promise as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush()

    expect(actor.getSnapshot().context.ethRecordSyncTxId).toBe('tx-eth-record')
    expect(
      actor
        .getSnapshot()
        .matches({ registering: { transaction: 'waitingForEthRecordSync' } }),
    ).toBe(true)
  })

  it('runs the EOA primary-name flow as forward then reverse', async () => {
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction
      .mockResolvedValueOnce({ hash: '0xeth' } as never)
      .mockResolvedValueOnce({ hash: '0xforward' } as never)
      .mockReturnValueOnce(deferred<{ hash: '0xreverse' }>().promise as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush(16)

    expect(startPrimaryNameForward).toHaveBeenCalledTimes(1)
    expect(startPrimaryNameReverse).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.primaryNameTxId).toBe(
      'tx-primary-reverse',
    )
    expect(
      actor.getSnapshot().matches({
        registering: { transaction: 'waitingForPrimaryNameReverse' },
      }),
    ).toBe(true)
  })

  it('runs the smart-account primary-name flow as a single transaction', async () => {
    isSmartFlow.mockImplementation(() => true)
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction
      .mockResolvedValueOnce({ hash: '0xeth' } as never)
      .mockReturnValueOnce(deferred<{ hash: '0xsmart' }>().promise as never)
    startSmartPrimaryName.mockResolvedValueOnce('tx-primary-smart')

    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount, { enabled: true, syncEthRecord: true }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush(16)

    expect(startSmartPrimaryName).toHaveBeenCalledTimes(1)
    expect(startPrimaryNameForward).not.toHaveBeenCalled()
    expect(startPrimaryNameReverse).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.primaryNameTxId).toBe('tx-primary-smart')
    expect(
      actor
        .getSnapshot()
        .matches({ registering: { transaction: 'waitingForPrimaryName' } }),
    ).toBe(true)
  })

  it('completes successfully after post-registration setup', async () => {
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction
      .mockResolvedValueOnce({ hash: '0xeth' } as never)
      .mockResolvedValueOnce({ hash: '0xforward' } as never)
      .mockResolvedValueOnce({ hash: '0xreverse' } as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush(20)

    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('transitions to failure when post-registration setup fails', async () => {
    startSyncEthRecord.mockRejectedValueOnce(new Error('post setup failed'))

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    getChild(actor).send({ type: 'FORCE_SUCCESS' } as any)
    await flush()

    expect(actor.getSnapshot().matches('failure')).toBe(true)
    expect(actor.getSnapshot().context.lastErrorMessage).toBe(
      'post setup failed',
    )
  })

  it('retries post-registration setup only, without retrying registration', async () => {
    startSyncEthRecord
      .mockRejectedValueOnce(new Error('post setup failed'))
      .mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction
      .mockResolvedValueOnce({ hash: '0xeth' } as never)
      .mockResolvedValueOnce({ hash: '0xforward' } as never)
      .mockResolvedValueOnce({ hash: '0xreverse' } as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    const child = getChild(actor)

    child.send({ type: 'FORCE_SUCCESS' } as any)
    await flush()

    expect(actor.getSnapshot().matches('failure')).toBe(true)
    expect(
      (child.getSnapshot().context as unknown as { retryCount: number })
        .retryCount,
    ).toBe(0)

    actor.send({ type: 'retry' })
    await flush(20)

    expect(startSyncEthRecord).toHaveBeenCalledTimes(2)
    expect(
      (child.getSnapshot().context as unknown as { retryCount: number })
        .retryCount,
    ).toBe(0)
  })
})
