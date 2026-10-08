// biome-ignore-all lint/suspicious/noExplicitAny: focused machine tests use compact fixtures
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assign, createActor, createMachine } from 'xstate'

/**
 * Events the stubbed registration child accepts. `FORCE_*` are test-only
 * drivers with no counterpart on the real machine. Declared at module scope so
 * `sendToChild` can type its callers against it — types are erased, so the
 * hoisted `vi.mock` factory below can still reference it.
 */
type RegistrationStubEvent =
  | { type: 'START_REGISTRATION'; primaryName?: string }
  | { type: 'RESUME'; stage: string; context: any; deps: any }
  | { type: 'FORCE_SUCCESS' }
  | { type: 'FORCE_ERROR'; error: Error; nameUnavailable?: boolean }
  | { type: 'RETRY' }
  | { type: 'SUSPEND' }

vi.mock('@ens-apps/transaction-manager', () => ({
  registrationMachine: createMachine({
    id: 'registrationStub',
    types: {} as { events: RegistrationStubEvent },
    on: {
      SUSPEND: {
        target: '.idle',
        actions: assign({ suspended: () => true }),
      },
    },
    context: {
      suspended: false,
      resolverAddress: undefined as Address | undefined,
      resolverTxId: 'tx-resolver',
      commitmentTxId: 'tx-commit',
      approvalTxId: 'tx-approve',
      registrationTxId: 'tx-register',
      registerReadyTimestamp: null as number | null,
      error: undefined as Error | undefined,
      nameUnavailable: undefined as boolean | undefined,
      retryCount: 0,
      primaryName: undefined as string | undefined,
      /** Captures the RESUME payload so tests can assert what was forwarded. */
      resumed: undefined as
        | { stage: string; context: any; deps: any }
        | undefined,
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          START_REGISTRATION: {
            target: 'running',
            actions: assign({
              primaryName: ({ event }) =>
                event.type === 'START_REGISTRATION'
                  ? event.primaryName
                  : undefined,
            }),
          },
          RESUME: {
            target: 'running',
            actions: assign({
              resumed: ({ event }) =>
                event.type === 'RESUME'
                  ? {
                      stage: event.stage,
                      context: event.context,
                      deps: event.deps,
                    }
                  : undefined,
            }),
          },
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
              error: ({ event }) =>
                event.type === 'FORCE_ERROR' ? event.error : undefined,
              nameUnavailable: ({ event }) =>
                event.type === 'FORCE_ERROR'
                  ? event.nameUnavailable
                  : undefined,
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
      // The real machine leaves `error` on RETRY (except for a name another
      // address already registered, which the UI is expected to stop before
      // it ever reaches the child).
      error: {
        on: {
          RETRY: {
            target: 'running',
            actions: assign({
              retryCount: ({ context }) => context.retryCount + 1,
            }),
          },
        },
      },
    },
  }),
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))

vi.mock('../service/syncEthAddressRecord', () => ({
  startSyncEthAddressRecordTransaction: vi.fn(async () => 'tx-eth-record'),
}))

vi.mock('../../profile/service/setPrimaryName', () => ({
  submitPrimaryNameForward: vi.fn(async () => 'tx-primary-forward'),
  submitPrimaryNameReverse: vi.fn(async () => 'tx-primary-reverse'),
  // Default to a clean owner: the cleanup pass is a no-op for anyone who has
  // never set an `addr.reverse` name, which is the common case.
  hasStaleAddrReverse: vi.fn(async () => false),
  submitClearAddrReverse: vi.fn(() => 'tx-addr-reverse-clear'),
}))

vi.mock('@/features/shared/registration/pricing', () => ({
  MIN_REGISTER_DURATION_SECONDS: 2_419_200,
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: { chain: { id: 11155111 } },
}))

vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => undefined,
}))

vi.mock('../service/registrationPersistence', () => ({
  clearStoredRegistrationFor: vi.fn(),
}))

import { waitForTransaction } from '@ens-apps/transaction-manager'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import {
  hasStaleAddrReverse,
  submitClearAddrReverse,
  submitPrimaryNameForward,
  submitPrimaryNameReverse,
} from '../../profile/service/setPrimaryName'
import { clearStoredRegistrationFor } from '../service/registrationPersistence'
import { startSyncEthAddressRecordTransaction } from '../service/syncEthAddressRecord'
import {
  getRegistrationV2ChildActor,
  getSuspendableRunOwner,
  registrationV2UiMachine,
} from './registrationUi.machine'

const waitForKnownTransaction = vi.mocked(waitForTransaction)
const startSyncEthRecord = vi.mocked(startSyncEthAddressRecordTransaction)
const startPrimaryNameForward = vi.mocked(submitPrimaryNameForward)
const startPrimaryNameReverse = vi.mocked(submitPrimaryNameReverse)
const checkStaleAddrReverse = vi.mocked(hasStaleAddrReverse)
const startAddrReverseClear = vi.mocked(submitClearAddrReverse)

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

/**
 * Drives the stubbed child. `getRegistrationV2ChildActor` is typed against the
 * real `registrationMachine`, whose event union has no test-only `FORCE_*`
 * members — but under `vi.mock` the running child is the stub above. Confining
 * that mismatch to one cast here keeps every call site checked against
 * `RegistrationStubEvent`, so a change to the stub's events breaks the tests
 * instead of compiling silently.
 */
const sendToChild = (
  actor: ReturnType<typeof startActorInTokens>,
  event: RegistrationStubEvent,
) => {
  const child = getChild(actor) as unknown as {
    send: (event: RegistrationStubEvent) => void
  }
  child.send(event)
}

/** `retryCount` is the stub's own counter — see `sendToChild` on the cast. */
const childRetryCount = (actor: ReturnType<typeof startActorInTokens>) =>
  (getChild(actor).getSnapshot().context as unknown as { retryCount: number })
    .retryCount

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

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

/** Run as a second tab: same storage, its own stable holder id. */
const asAnotherTab = <T>(run: () => T): T => {
  const held = sessionStorage.getItem('ens-registration-holder')
  sessionStorage.setItem('ens-registration-holder', 'other-tab')
  try {
    return run()
  } finally {
    if (held) sessionStorage.setItem('ens-registration-holder', held)
    else sessionStorage.removeItem('ens-registration-holder')
  }
}

afterEach(() => {
  vi.clearAllMocks()
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

  it('refuses to start while the wallet is registering another name', async () => {
    const { acquireRegistrationLock, releaseRegistrationLock } = await import(
      '../service/registrationLock'
    )
    asAnotherTab(() => acquireRegistrationLock(EOA_ADDRESS, 'othername.eth'))

    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: {} as any,
      } as unknown as SmartAccountContextValue),
    )

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('failure')
    expect(snapshot.context.lastErrorMessage).toMatch(/othername\.eth/i)
    // Nothing started here, so the screen names the blocking run rather than
    // reporting this one as failed.
    expect(snapshot.context.isWalletBusy).toBe(true)

    // QA's sequence: the block held, then Try Again went straight through.
    actor.send({ type: 'retry' })
    expect(actor.getSnapshot().value).toBe('failure')

    // Only once the other tab is done does the retry proceed, and it must
    // actually start the child: it never received START_REGISTRATION, so a
    // RETRY alone would leave it idle and the screen stuck.
    asAnotherTab(() => releaseRegistrationLock(EOA_ADDRESS))
    actor.send({ type: 'retry' })
    expect(actor.getSnapshot().matches('registering')).toBe(true)
    expect(getChild(actor).getSnapshot().value).toBe('running')
    expect(actor.getSnapshot().context.isWalletBusy).toBe(false)
  })

  // A refusal is not a failure, and a later real failure must not keep
  // presenting itself as one.
  it('clears the busy notice when the user leaves or something fails', async () => {
    const { acquireRegistrationLock, releaseRegistrationLock } = await import(
      '../service/registrationLock'
    )
    asAnotherTab(() => acquireRegistrationLock(EOA_ADDRESS, 'othername.eth'))

    const hcaAccount = {
      signer: { type: 'rhinestone' },
      accountAddress: HCA_ADDRESS,
      ownerAddress: EOA_ADDRESS,
      walletClient: {},
    } as unknown as SmartAccountContextValue

    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    expect(actor.getSnapshot().context.isWalletBusy).toBe(true)

    // Going back to the quote drops it, and so does a later real error: both
    // would otherwise keep showing "another registration is running".
    actor.send({ type: 'cancel' })
    expect(actor.getSnapshot().context.isWalletBusy).toBe(false)

    asAnotherTab(() => releaseRegistrationLock(EOA_ADDRESS))
    actor.send({ type: '$error', error: new Error('reverted') })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('failure')
    expect(snapshot.context.isWalletBusy).toBe(false)
    expect(snapshot.context.lastErrorMessage).toBe('reverted')
  })

  // QA hit this: the block held, then Try Again re-entered `registering`
  // without re-checking, and both names registered at once.
  it('refuses a retry while the wallet is registering another name', async () => {
    const { acquireRegistrationLock, releaseRegistrationLock } = await import(
      '../service/registrationLock'
    )
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: {} as any,
      } as unknown as SmartAccountContextValue),
    )
    expect(actor.getSnapshot().matches('registering')).toBe(true)

    // Another tab takes the wallet while this one sits on the failure screen.
    releaseRegistrationLock(EOA_ADDRESS)
    asAnotherTab(() => acquireRegistrationLock(EOA_ADDRESS, 'othername.eth'))
    actor.send({ type: '$error', error: new Error('boom') })
    expect(actor.getSnapshot().value).toBe('failure')

    actor.send({ type: 'retry' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('failure')
    expect(snapshot.context.lastErrorMessage).toMatch(/othername\.eth/i)
  })

  it('allows a retry once the wallet is free again', async () => {
    const { releaseRegistrationLock } = await import(
      '../service/registrationLock'
    )
    const actor = startActorInTokens()

    actor.send(
      startEvent({
        signer: { type: 'rhinestone' } as any,
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: {} as any,
      } as unknown as SmartAccountContextValue),
    )
    actor.send({ type: '$error', error: new Error('boom') })
    releaseRegistrationLock(EOA_ADDRESS)

    actor.send({ type: 'retry' })

    expect(actor.getSnapshot().matches('registering')).toBe(true)
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
    // Primary-name legs are sent by the owner wallet, so it must be present.
    walletClient: { account: { address: EOA_ADDRESS } } as any,
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

  describe.each([
    'EOA',
    'HCA',
  ])('%s canonical primary-name registration', (mode) => {
    it.each([
      'ALICE',
      'cafe\u0301',
    ])('refuses noncanonical label %s before starting registration', (label) => {
      const actor = startActorInTokens()
      actor.send({
        ...startEvent(mode === 'EOA' ? eoaAccount : smartAccount, {
          enabled: true,
        }),
        label,
      })
      expect(actor.getSnapshot().matches('failure')).toBe(true)
      expect(actor.getSnapshot().context.lastErrorMessage).toMatch(/canonical/)
      expect(getChild(actor).getSnapshot().matches('idle')).toBe(true)
      expect(startSyncEthRecord).not.toHaveBeenCalled()
      expect(startPrimaryNameForward).not.toHaveBeenCalled()
      actor.stop()
    })
  })

  it('keeps the registered Unicode label in both EOA primary-name legs', async () => {
    const actor = startActorInTokens()
    actor.send({ ...startEvent(eoaAccount, { enabled: true }), label: 'café' })
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(24)
    expect(actor.getSnapshot().context.confirmedData?.label).toBe('café')
    expect(startPrimaryNameForward).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'café.eth' }),
    )
    expect(startPrimaryNameReverse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'café.eth' }),
    )
    actor.stop()
  })

  it('keeps the registered Unicode label in the HCA primary-name bundle', () => {
    const actor = startActorInTokens()
    actor.send({
      ...startEvent(smartAccount, { enabled: true }),
      label: 'café',
    })
    expect(actor.getSnapshot().context.confirmedData?.label).toBe('café')
    expect(getChild(actor).getSnapshot().context.primaryName).toBe('café.eth')
    actor.stop()
  })

  it('waits for forward verification and preserves registration success when it fails', async () => {
    const verification = deferred<string>()
    startPrimaryNameForward.mockReturnValueOnce(verification.promise)
    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()
    expect(
      actor
        .getSnapshot()
        .matches({ registering: { transaction: 'settingPrimaryNameForward' } }),
    ).toBe(true)
    expect(waitForKnownTransaction).not.toHaveBeenCalled()
    expect(startPrimaryNameReverse).not.toHaveBeenCalled()
    verification.reject(new Error('Name does not resolve to owner'))
    await flush()
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
    expect(startPrimaryNameReverse).not.toHaveBeenCalled()
    actor.stop()
  })

  it('keeps the existing no-setup success path immediate', async () => {
    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount))

    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(startSyncEthRecord).not.toHaveBeenCalled()
  })

  it('enters explicit post-registration states when setup exists', async () => {
    const fwdWait = deferred()
    waitForKnownTransaction.mockReturnValueOnce(fwdWait.promise as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: false }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    const snap = actor.getSnapshot()
    expect(
      snap.matches({
        registering: { transaction: 'waitingForPrimaryNameForward' },
      }),
    ).toBe(true)
    expect(startSyncEthRecord).not.toHaveBeenCalled()
    expect(startPrimaryNameForward).toHaveBeenCalled()
  })

  it('stores the ETH record tx id before waiting for confirmation', async () => {
    const wait = deferred<{ hash: '0xhash' }>()
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction.mockReturnValueOnce(wait.promise as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(actor.getSnapshot().context.ethRecordSyncTxId).toBe('tx-eth-record')
    expect(startSyncEthRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'example.eth',
      }),
    )
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
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
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

  it('sets the primary name inside the HCA bundle and skips the EOA legs', async () => {
    // The reveal batch sets the ETH addr record and the primary name via the
    // reverse-registrar adapter, so no post-registration EOA setup runs.
    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount, { enabled: true, syncEthRecord: true }))

    expect(getChild(actor).getSnapshot().context.primaryName).toBe(
      'example.eth',
    )

    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    expect(startSyncEthRecord).not.toHaveBeenCalled()
    expect(startPrimaryNameForward).not.toHaveBeenCalled()
    expect(startPrimaryNameReverse).not.toHaveBeenCalled()
    // The cleanup pass still runs, but finds nothing to clear and so never
    // prompts the wallet.
    expect(checkStaleAddrReverse).toHaveBeenCalledTimes(1)
    expect(startAddrReverseClear).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(false)
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('clears a shadowing addr.reverse from the owner EOA after an HCA bundle', async () => {
    // `addr.reverse` outranks the `default.reverse` claim the reveal batch
    // made, so without this the new primary name never resolves.
    checkStaleAddrReverse.mockResolvedValueOnce(true)
    waitForKnownTransaction.mockReturnValueOnce(
      deferred<{ hash: '0xclear' }>().promise as never,
    )

    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    expect(startAddrReverseClear).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAddress: EOA_ADDRESS,
        signer: expect.objectContaining({ type: 'eoa' }),
      }),
    )
    expect(actor.getSnapshot().context.addrReverseClearTxId).toBe(
      'tx-addr-reverse-clear',
    )
    expect(
      actor.getSnapshot().matches({
        registering: { transaction: 'waitingForAddrReverseClear' },
      }),
    ).toBe(true)
  })

  it('reaches success once the addr.reverse clear confirms', async () => {
    checkStaleAddrReverse.mockResolvedValueOnce(true)
    waitForKnownTransaction.mockResolvedValueOnce({ hash: '0xclear' } as never)

    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    // Attempted exactly once — the decision state is re-entered afterwards and
    // must not loop back into the clear.
    expect(startAddrReverseClear).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(false)
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('skips the addr.reverse cleanup when no primary name was bundled', async () => {
    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    expect(checkStaleAddrReverse).not.toHaveBeenCalled()
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('still succeeds when the addr.reverse clear is rejected', async () => {
    checkStaleAddrReverse.mockRejectedValueOnce(new Error('user rejected'))

    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    // The name is registered and the default claim is written; only the
    // cleanup failed, so this is a flagged success, not a failure.
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('does not put a primary name in the bundle when the user opted out', () => {
    const actor = startActorInTokens()
    actor.send(startEvent(smartAccount))

    expect(getChild(actor).getSnapshot().context.primaryName).toBeUndefined()
  })

  it('completes successfully after post-registration setup', async () => {
    startSyncEthRecord.mockResolvedValueOnce('tx-eth-record')
    waitForKnownTransaction
      .mockResolvedValueOnce({ hash: '0xeth' } as never)
      .mockResolvedValueOnce({ hash: '0xforward' } as never)
      .mockResolvedValueOnce({ hash: '0xreverse' } as never)

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(20)

    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('completes successfully when post-registration setup fails', async () => {
    // The name is already registered, so a failed optional setup step must not
    // surface as a failed registration.
    startSyncEthRecord.mockRejectedValueOnce(new Error('post setup failed'))

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true, syncEthRecord: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(actor.getSnapshot().matches('failure')).toBe(false)
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
  })

  it('marks setup failed when the owner wallet client is missing', async () => {
    // Setup was requested but the primary-name legs can't be sent without the
    // owner wallet: registration still succeeds, with the failure notice.
    const noWalletAccount = {
      ...eoaAccount,
      walletClient: null,
    } as unknown as SmartAccountContextValue

    const actor = startActorInTokens()
    actor.send(startEvent(noWalletAccount, { enabled: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(startPrimaryNameForward).not.toHaveBeenCalled()
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
  })

  it('marks setup failed when the wallet no longer controls the owner address', async () => {
    // The wallet client and owner address are captured together but can
    // diverge if the user switches accounts mid-registration: skip the legs
    // (they would fail at the transport) and surface the failure notice.
    const divergedAccount = {
      ...eoaAccount,
      walletClient: {
        account: { address: '0x9999999999999999999999999999999999999999' },
      } as any,
    } as unknown as SmartAccountContextValue

    const actor = startActorInTokens()
    actor.send(startEvent(divergedAccount, { enabled: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(startPrimaryNameForward).not.toHaveBeenCalled()
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
  })

  it('marks setup failed when the wallet client has no bound account', async () => {
    // Account-less client (mid-reconnect): we can't verify it controls the
    // owner address, so skip the legs and surface the failure notice.
    const accountlessAccount = {
      ...eoaAccount,
      walletClient: {} as any,
    } as unknown as SmartAccountContextValue

    const actor = startActorInTokens()
    actor.send(startEvent(accountlessAccount, { enabled: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush()

    expect(startPrimaryNameForward).not.toHaveBeenCalled()
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
  })

  it('completes successfully when the primary-name transaction is rejected', async () => {
    // Regression: rejecting the primary-name wallet transaction must not fail
    // the (already successful) registration or loop.
    waitForKnownTransaction.mockRejectedValueOnce(
      new Error('User rejected the request'),
    )

    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount, { enabled: true }))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    await flush(16)

    expect(startPrimaryNameForward).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().matches('failure')).toBe(false)
    expect(
      actor.getSnapshot().matches({ registering: { transaction: 'success' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.postRegistrationSetupFailed).toBe(true)
  })
})

const resumeRecord = (
  overrides: { stage?: string; primaryName?: string } = {},
) => ({
  v: 1,
  fingerprint: 'test-fingerprint',
  stage: overrides.stage ?? 'commitmentCooldown',
  updatedAt: 1,
  context: {
    chainId: 11155111,
    name: 'example.eth',
    duration: 31_536_000n,
    selectedToken: 'USDC' as const,
    tokenPrice: 900_000n,
    signerType: 'rhinestone' as const,
    accountAddress: HCA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    resolverAddress: '0x9999999999999999999999999999999999999999' as const,
    commitment: {
      commitment: `0x${'ab'.repeat(32)}` as const,
      secret: `0x${'cd'.repeat(32)}` as const,
    },
    primaryName: overrides.primaryName,
  },
})

const resumeEvent = (
  account: SmartAccountContextValue,
  overrides: { stage?: string; primaryName?: string; totalPrice?: bigint } = {},
) =>
  ({
    type: 'registration.resume' as const,
    label: 'example',
    confirmedData: {
      label: 'example',
      duration: 31_536_000n,
      ownerAddress: EOA_ADDRESS as Address,
      token: 'USDC' as const,
      // Deliberately different from the record's stored tokenPrice, so the
      // assertions can tell which one reaches the child.
      totalPrice: overrides.totalPrice ?? 1_200_000n,
      basePriceNumber: 1.2,
      premiumPriceNumber: 0,
    },
    record: resumeRecord(overrides),
    account,
  }) as const

describe('registrationV2UiMachine — registration.resume', () => {
  const hcaAccount = {
    signer: { type: 'rhinestone' },
    accountAddress: HCA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: {},
  } as unknown as SmartAccountContextValue

  // A reload drops this tab's claim, so the resumed run has to take it again
  // before it continues a commit on the wallet's nonce.
  it('refuses to resume while the wallet is registering another name', async () => {
    const { acquireRegistrationLock, releaseRegistrationLock } = await import(
      '../service/registrationLock'
    )
    asAnotherTab(() => acquireRegistrationLock(EOA_ADDRESS, 'othername.eth'))
    const actor = createActor(registrationV2UiMachine, {
      input: { chainId: 11155111 },
    })
    actor.start()

    actor.send(resumeEvent(hcaAccount))

    const refused = actor.getSnapshot()
    expect(refused.value).toBe('failure')
    expect(refused.context.lastErrorMessage).toMatch(/othername\.eth/i)

    asAnotherTab(() => releaseRegistrationLock(EOA_ADDRESS))
    actor.send({ type: 'retry' })
    expect(actor.getSnapshot().matches('registering')).toBe(true)
  })

  it('claims the wallet when it resumes', async () => {
    const { acquireRegistrationLock } = await import(
      '../service/registrationLock'
    )
    const actor = createActor(registrationV2UiMachine, {
      input: { chainId: 11155111 },
    })
    actor.start()

    actor.send(resumeEvent(hcaAccount))
    expect(actor.getSnapshot().matches('registering')).toBe(true)

    asAnotherTab(() => {
      expect(acquireRegistrationLock(EOA_ADDRESS, 'other.eth')).toBe(false)
    })
  })

  it('resumes from the pricing step a fresh mount lands on', () => {
    // A reload puts the UI machine in `pricing.duration`, not `pricing.tokens`.
    // The event is handled on the `pricing` state precisely so both work.
    const actor = createActor(registrationV2UiMachine, {
      input: { chainId: 11155111 },
    })
    actor.start()
    expect(actor.getSnapshot().value).toMatchObject({ pricing: 'duration' })

    actor.send(resumeEvent(hcaAccount))

    expect(actor.getSnapshot().value).toMatchObject({ registering: {} })
  })

  it('drops a resume that arrives while a registration is already running', () => {
    // The resume tail can dispatch late — delayed behind a wallet prompt the
    // user ignored while starting a fresh registration by hand. Re-entering
    // `registering` at that point would reset its parallel regions (the
    // notification prompt reappears) and clobber the live run's confirmedData
    // with the stored record's stale pricing.
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    expect(actor.getSnapshot().value).toMatchObject({ registering: {} })
    const liveConfirmed = actor.getSnapshot().context.confirmedData

    actor.send(resumeEvent(hcaAccount))

    const child = getChild(actor).getSnapshot() as unknown as {
      context: { resumed?: unknown }
    }
    expect(child.context.resumed).toBeUndefined()
    expect(actor.getSnapshot().context.confirmedData).toBe(liveConfirmed)
  })

  it('forwards RESUME to the child, never START_REGISTRATION', () => {
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount))

    const child = getChild(actor).getSnapshot() as unknown as {
      context: { resumed?: { stage: string; context: any; deps: any } }
    }
    expect(child.context.resumed).toBeDefined()
    expect(child.context.resumed?.stage).toBe('commitmentCooldown')
    // The unguessable half — losing it means paying for a second commitment.
    expect(child.context.resumed?.context.commitment.secret).toBe(
      `0x${'cd'.repeat(32)}`,
    )
    expect(child.context.resumed?.context.resolverAddress).toBe(
      '0x9999999999999999999999999999999999999999',
    )
  })

  it('sends the re-quoted price, not the one stored before the user left', () => {
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount, { totalPrice: 1_200_000n }))

    const child = getChild(actor).getSnapshot() as unknown as {
      context: { resumed?: { context: { tokenPrice: bigint } } }
    }
    // The record carried 900_000n; the premium decayed while the tab was shut.
    expect(child.context.resumed?.context.tokenPrice).toBe(1_200_000n)
  })

  it('rebuilds runtime deps from the live account rather than storage', () => {
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount))

    const child = getChild(actor).getSnapshot() as unknown as {
      context: { resumed?: { deps: any } }
    }
    expect(child.context.resumed?.deps.signer).toBe(hcaAccount.signer)
    expect(child.context.resumed?.deps.approvalSigner).toMatchObject({
      type: 'eoa',
    })
    expect(child.context.resumed?.deps.publicClient).toBeDefined()
  })

  it('hands the resumed run a way to re-authorize the session', () => {
    const reauthorizeSession = vi.fn()
    const actor = startActorInTokens()

    actor.send(resumeEvent({ ...hcaAccount, reauthorizeSession }))

    const child = getChild(actor).getSnapshot() as unknown as {
      readonly context: {
        readonly resumed?: {
          readonly deps: {
            readonly reauthorizeSession?: typeof reauthorizeSession
          }
        }
      }
    }
    expect(child.context.resumed?.deps.reauthorizeSession).toBe(
      reauthorizeSession,
    )
  })

  it('restores the confirmed pricing so the registering screen can render', () => {
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount))

    expect(actor.getSnapshot().context.confirmedData).toMatchObject({
      label: 'example',
      totalPrice: 1_200_000n,
      basePriceNumber: 1.2,
    })
  })

  it('carries the primary name the ORIGINAL run committed to', () => {
    // The reveal batch already bundles it; re-deriving from current UI state
    // could disagree with the batch that is in flight.
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount, { primaryName: 'example.eth' }))

    expect(actor.getSnapshot().context.hcaPrimaryName).toBe('example.eth')
  })

  it('restores the resolver so post-registration does not deploy a second one', () => {
    const actor = startActorInTokens()

    actor.send(resumeEvent(hcaAccount))

    expect(actor.getSnapshot().context.postRegistrationData).toMatchObject({
      resolverAddress: '0x9999999999999999999999999999999999999999',
    })
  })

  it('fails fast when the owner wallet cannot sign the payment approval', () => {
    const actor = startActorInTokens()

    actor.send(
      resumeEvent({
        signer: { type: 'rhinestone' },
        accountAddress: HCA_ADDRESS,
        ownerAddress: EOA_ADDRESS,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    expect(actor.getSnapshot().value).toBe('failure')
  })

  it('fails fast when the account is not ready', () => {
    const actor = startActorInTokens()

    actor.send(
      resumeEvent({
        signer: null,
        accountAddress: null,
        ownerAddress: null,
        walletClient: null,
      } as unknown as SmartAccountContextValue),
    )

    expect(actor.getSnapshot().value).toBe('failure')
  })
})

describe('registrationV2UiMachine — registration.suspend', () => {
  const hcaAccount = {
    signer: { type: 'rhinestone' },
    accountAddress: HCA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: {},
  } as unknown as SmartAccountContextValue

  const isChildSuspended = (actor: ReturnType<typeof startActorInTokens>) =>
    (
      getChild(actor).getSnapshot() as unknown as {
        context: { suspended: boolean }
      }
    ).context.suspended

  it('stops a live run and goes back to pricing', () => {
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    expect(getSuspendableRunOwner(actor.getSnapshot())).toBe(EOA_ADDRESS)

    actor.send({ type: 'registration.suspend' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    // Suspended, not cancelled: the child keeps the run for its owner to resume.
    expect(isChildSuspended(actor)).toBe(true)
    expect(actor.getSnapshot().context.confirmedData).toBeUndefined()
    expect(getSuspendableRunOwner(actor.getSnapshot())).toBeUndefined()
  })

  it('leaves a registered name alone', () => {
    // Registered, with the notification prompt still open: nothing left to
    // protect by stopping it.
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    sendToChild(actor, { type: 'FORCE_SUCCESS' })
    expect(getSuspendableRunOwner(actor.getSnapshot())).toBeUndefined()

    actor.send({ type: 'registration.suspend' })

    expect(actor.getSnapshot().value).toMatchObject({ registering: {} })
    expect(isChildSuspended(actor)).toBe(false)
  })

  it('suspends a failed run, so Try Again cannot carry on with the old wallet', () => {
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    sendToChild(actor, { type: 'FORCE_ERROR', error: new Error('boom') })
    expect(actor.getSnapshot().value).toBe('failure')
    expect(getSuspendableRunOwner(actor.getSnapshot())).toBe(EOA_ADDRESS)

    actor.send({ type: 'registration.suspend' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    expect(isChildSuspended(actor)).toBe(true)
  })
})

describe('registrationV2UiMachine — a failed run restored after a reload', () => {
  const hcaAccount = {
    signer: { type: 'rhinestone' },
    accountAddress: HCA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: {},
  } as unknown as SmartAccountContextValue

  /** A fresh mount, as a reload leaves it, with a stored failure restored. */
  const startRestoredFailure = () => {
    const actor = createActor(registrationV2UiMachine, {
      input: { chainId: 11155111 },
    })
    actor.start()
    actor.send({
      type: 'registration.failure.restore',
      confirmedData: resumeEvent(hcaAccount).confirmedData,
    })
    return actor
  }

  const childResumed = (actor: ReturnType<typeof startActorInTokens>) =>
    (
      getChild(actor).getSnapshot() as unknown as {
        context: { resumed?: unknown }
      }
    ).context.resumed

  it('shows the failure screen without re-running the registration', () => {
    const actor = startRestoredFailure()

    expect(actor.getSnapshot().value).toBe('failure')
    expect(actor.getSnapshot().context.restoredFailure).toBe(true)
    // Nothing reaches the child until the user asks for it.
    expect(getChild(actor).getSnapshot().value).toBe('idle')
    expect(childResumed(actor)).toBeUndefined()
  })

  it('belongs to its owner, so a wallet switch suspends it', () => {
    const actor = startRestoredFailure()

    expect(getSuspendableRunOwner(actor.getSnapshot())).toBe(EOA_ADDRESS)

    actor.send({ type: 'registration.suspend' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    // Kept for its owner, who gets the failure screen back on reconnect.
    expect(clearStoredRegistrationFor).not.toHaveBeenCalled()
  })

  it('leaves Try Again to the resume, since the child never resumed', () => {
    const actor = startRestoredFailure()

    actor.send({ type: 'retry' })

    expect(actor.getSnapshot().value).toBe('failure')
    expect(childRetryCount(actor)).toBe(0)
  })

  it('continues from the stored commitment once resumed', () => {
    const actor = startRestoredFailure()

    actor.send(resumeEvent(hcaAccount, { stage: 'error' }))

    expect(actor.getSnapshot().value).toMatchObject({ registering: {} })
    expect(actor.getSnapshot().context.restoredFailure).toBe(false)
    expect(childResumed(actor)).toMatchObject({
      context: { commitment: { secret: `0x${'cd'.repeat(32)}` } },
    })
  })

  it('discards the stored run on Back to Quote', () => {
    const actor = startRestoredFailure()

    actor.send({ type: 'cancel' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    expect(actor.getSnapshot().context.restoredFailure).toBe(false)
    expect(clearStoredRegistrationFor).toHaveBeenCalledExactlyOnceWith(
      'example',
    )
  })

  it('stays restored when the wallet lock refuses the resume', async () => {
    // Nothing reached the child, so Back to Quote must still discard the
    // record, and Try Again must still go through the resume.
    const { acquireRegistrationLock } = await import(
      '../service/registrationLock'
    )
    asAnotherTab(() => acquireRegistrationLock(EOA_ADDRESS, 'othername.eth'))
    const actor = startRestoredFailure()

    actor.send(resumeEvent(hcaAccount, { stage: 'error' }))

    expect(actor.getSnapshot().value).toBe('failure')
    expect(actor.getSnapshot().context.isWalletBusy).toBe(true)
    expect(actor.getSnapshot().context.restoredFailure).toBe(true)
    expect(getChild(actor).getSnapshot().value).toBe('idle')

    actor.send({ type: 'cancel' })

    expect(clearStoredRegistrationFor).toHaveBeenCalledExactlyOnceWith(
      'example',
    )
  })

  it('stays restored when the account is not ready to resume', () => {
    const actor = startRestoredFailure()

    actor.send(
      resumeEvent(
        {
          signer: null,
          accountAddress: null,
          ownerAddress: null,
          walletClient: null,
        } as unknown as SmartAccountContextValue,
        { stage: 'error' },
      ),
    )
    expect(actor.getSnapshot().value).toBe('failure')
    expect(actor.getSnapshot().context.restoredFailure).toBe(true)

    // A machine retry would forward RETRY to an idle child and park the
    // screen on registering.
    actor.send({ type: 'retry' })

    expect(actor.getSnapshot().value).toBe('failure')
  })

  it('keeps the stored run when the user moves to another name', () => {
    const actor = startRestoredFailure()

    actor.send({ type: 'label.changed' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    expect(actor.getSnapshot().context.restoredFailure).toBe(false)
    expect(clearStoredRegistrationFor).not.toHaveBeenCalled()
  })

  it("leaves a live failure's record to the persistence subscriber", () => {
    // A live child cancels to idle, which clears its own record.
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))
    sendToChild(actor, { type: 'FORCE_ERROR', error: new Error('boom') })
    expect(actor.getSnapshot().context.restoredFailure).toBe(false)

    actor.send({ type: 'cancel' })

    expect(actor.getSnapshot().value).toMatchObject({ pricing: {} })
    expect(clearStoredRegistrationFor).not.toHaveBeenCalled()
  })

  it('is not restored over a registration already running', () => {
    const actor = startActorInTokens()
    actor.send(startEvent(hcaAccount))

    actor.send({
      type: 'registration.failure.restore',
      confirmedData: resumeEvent(hcaAccount).confirmedData,
    })

    expect(actor.getSnapshot().value).toMatchObject({ registering: {} })
    expect(actor.getSnapshot().context.restoredFailure).toBe(false)
  })
})

describe('registrationV2UiMachine — name lost to another registrant', () => {
  const eoaAccount = {
    signer: { type: 'eoa', walletClient: {} as never },
    accountAddress: EOA_ADDRESS,
    ownerAddress: EOA_ADDRESS,
    walletClient: { account: { address: EOA_ADDRESS } } as any,
  } as unknown as SmartAccountContextValue

  const failWithNameTaken = async () => {
    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount))
    sendToChild(actor, {
      type: 'FORCE_ERROR',
      error: new Error('example.eth was registered by another address first.'),
      nameUnavailable: true,
    })
    await flush()
    return actor
  }

  it('carries the lost-race flag onto the failure screen', async () => {
    const actor = await failWithNameTaken()

    expect(actor.getSnapshot().matches('failure')).toBe(true)
    expect(actor.getSnapshot().context.nameUnavailable).toBe(true)
  })

  it('refuses retry rather than parking on the pending screen', async () => {
    // The child refuses the forwarded RETRY, so moving back to `registering`
    // would leave the user watching a spinner that can never resolve.
    const actor = await failWithNameTaken()

    actor.send({ type: 'retry' })
    await flush()

    expect(actor.getSnapshot().matches('failure')).toBe(true)
    expect(childRetryCount(actor)).toBe(0)
  })

  it('still retries an ordinary failure', async () => {
    const actor = startActorInTokens()
    actor.send(startEvent(eoaAccount))
    sendToChild(actor, { type: 'FORCE_ERROR', error: new Error('rpc down') })
    await flush()

    expect(actor.getSnapshot().context.nameUnavailable).toBe(false)

    actor.send({ type: 'retry' })
    await flush()

    expect(actor.getSnapshot().matches('registering')).toBe(true)
    expect(childRetryCount(actor)).toBe(1)
  })
})
