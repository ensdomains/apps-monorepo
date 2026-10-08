import { logger } from '@ens-apps/utils/logger'
import type { Address, Hash, PublicClient } from 'viem'
import { type ActorRefFrom, createActor } from 'xstate'
import { randomNonce } from '../helpers/flow-identity'
import { toPersistableRequest } from '../helpers/persistableRequest'
import {
  archiveTransaction,
  clearAllTransactions,
  type PersistedTransaction,
  removeTransaction,
  saveTransaction,
} from '../helpers/transaction-persistence'
import { transactionMachine } from '../machines/transaction.machine'
import { createRunTelemetryService } from '../services/run-telemetry.service'
import type {
  FailedRunPayloadV2,
  RunTelemetryEventSubscriber,
  RunTelemetrySubscriber,
  TransactionRunEventV2,
  TransactionRunStatus,
} from '../types/audit.types'
import type { Signer } from '../types/signer.types'
import type {
  TransactionIntent,
  TransactionOptions,
  TransactionRequest,
} from '../types/transaction.types'

type TransactionChangeListener = (
  transactions: Map<string, ActorRefFrom<typeof transactionMachine>>,
) => void

/**
 * A transaction that has reached a terminal state, emitted to
 * {@link TransactionManager.onTransactionArchived} subscribers. This is the
 * seam through which an app reports transaction history to a backend (the
 * core package stays transport- and app-agnostic).
 */
export interface ArchivedTransaction {
  txId: string
  chainId?: number
  hash?: Hash
  status: TransactionRunStatus
  /** Caller-supplied operation kind (e.g. 'set-resolver'); see TransactionOptions.operation */
  operation?: string
  /** ENS name involved, for display */
  name?: string
  request?: TransactionRequest
  error?: string
  timestamp: number
}

type TransactionArchivedListener = (transaction: ArchivedTransaction) => void

/**
 * Build the {@link ArchivedTransaction} payload emitted when a transaction
 * reaches a terminal state. Pure (the timestamp is supplied) so the
 * name/request fallback logic is unit-testable in isolation.
 *
 * - `name` prefers the caller-supplied option, falling back to the intent name
 *   for ENS renewals.
 * - `request` prefers the prepared request, falling back to a custom intent's
 *   embedded request.
 */
export function buildArchivedTransaction(input: {
  txId: string
  chainId?: number
  status: TransactionRunStatus
  hash?: Hash
  error?: string
  operation?: string
  name?: string
  intent?: TransactionIntent
  request?: TransactionRequest
  timestamp: number
}): ArchivedTransaction {
  const { intent, name, request } = input
  return {
    txId: input.txId,
    chainId: input.chainId,
    hash: input.hash,
    status: input.status,
    operation: input.operation,
    name: name ?? (intent?.type === 'ens-renewal' ? intent.name : undefined),
    request:
      request || (intent?.type === 'custom' ? intent.request : undefined),
    error: input.error,
    timestamp: input.timestamp,
  }
}

function getRootState(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > 0 && keys[0]) return keys[0]
  }
  return String(value)
}

function isCancelledState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const root = (value as Record<string, unknown>).error
  return root === 'cancelled'
}

function generateTransactionId(): string {
  return `tx-${Date.now()}-${randomNonce()}`
}

/**
 * The wallet a transaction will be signed by, so an actor can be scoped to the
 * account that started it. Every request variant requires a `from` and every
 * intent variant carries one, so this is always derivable from the work
 * itself.
 */
export function resolveOwnerAccount(input: {
  intent?: TransactionIntent
  request?: TransactionRequest
}): Address | undefined {
  const { intent, request } = input
  const from =
    request?.from ??
    (intent?.type === 'custom' ? intent.request.from : intent?.from)
  return from ? (from.toLowerCase() as Address) : undefined
}

/**
 * Whether an actor has finished: it reached success or error, or it has
 * already been stopped. Anything else is still in flight — a wallet prompt may
 * be open, or a receipt still being polled for — and stopping it would strand
 * everything waiting on it.
 */
export function isTransactionSettled(
  actor: ActorRefFrom<typeof transactionMachine>,
): boolean {
  const snapshot = actor.getSnapshot()
  if (snapshot.status !== 'active') return true
  const state = getRootState(snapshot.value)
  return state === 'success' || state === 'error'
}

/**
 * Transaction Manager Singleton
 *
 * SSR-safe module-level singleton that manages transaction actors.
 * Can be called directly without React context.
 *
 * SSR Safety:
 * - PublicClients are stored per-chain (safe to share - no user data)
 * - Supports fallback to per-transaction publicClient if not pre-configured
 * - Safe to use in Next.js, Remix, etc.
 *
 * Benefits:
 * - No prop drilling - import and call directly
 * - Works outside React (Node.js, CLI, tests)
 * - Single source of truth for all transactions
 * - Supports multiple chains simultaneously
 * - Still supports React integration via change listeners
 */
class TransactionManager {
  private transactions = new Map<
    string,
    ActorRefFrom<typeof transactionMachine>
  >()
  /**
   * txId -> the wallet that started it. Actor identity is scoped to the
   * account so a receipt produced by a different wallet can never satisfy a
   * step of the flow the current wallet is running.
   */
  private transactionAccounts = new Map<string, Address>()
  private connectedAccount: Address | undefined
  /**
   * Ids belonging to a wallet that is no longer connected, which were still in
   * flight when the switch happened. They are dropped once they settle, so
   * their waiters and history reporting complete first.
   */
  private retireOnceSettled = new Set<string>()
  private listeners = new Set<TransactionChangeListener>()
  private telemetryListeners = new Set<RunTelemetrySubscriber>()
  private telemetryEventListeners = new Set<RunTelemetryEventSubscriber>()
  private archivedListeners = new Set<TransactionArchivedListener>()
  private publicClients = new Map<number, PublicClient>() // chainId -> PublicClient
  private completedTelemetry = new Set<string>()
  private runTelemetry = createRunTelemetryService()

  /**
   * Set a public client for a specific chain
   *
   * Optional - if set, you don't need to pass publicClient in startTransaction
   * options. Useful for reducing verbosity in single-chain or multi-chain apps.
   */
  setPublicClient(chainId: number, publicClient: PublicClient): void {
    this.publicClients.set(chainId, publicClient)
  }

  /**
   * Get a stored public client for a chain
   */
  getPublicClient(chainId: number): PublicClient | undefined {
    return this.publicClients.get(chainId)
  }

  /**
   * Tell the manager which wallet is connected.
   *
   * Actor identity is scoped to the account that started the transaction: a
   * receipt another wallet produced must never satisfy a step of the flow the
   * current wallet is running. Naming a different account therefore retires
   * every actor another account owns.
   *
   * Two deliberate restrictions:
   *
   * - `undefined` means "no wallet is known right now", which is what a lock,
   *   a reconnect or a disconnect reports. That is not evidence some *other*
   *   wallet is in charge, so it records the state and retires nothing —
   *   otherwise a wallet locking mid-flow would throw away the very actors the
   *   modal is rendering. Tearing everything down on disconnect is
   *   {@link clearAllAndPersistence}, which an app calls explicitly.
   * - An in-flight actor is never stopped here. It may have a wallet prompt
   *   open or a receipt in flight, and the transaction lands on-chain
   *   regardless; it is marked instead and retired once it settles, so its
   *   waiters, history entry and telemetry all complete first.
   *
   * Idempotent: re-stating the same account does nothing.
   */
  setConnectedAccount(account: Address | undefined): void {
    const next = account ? (account.toLowerCase() as Address) : undefined
    if (next === this.connectedAccount) return
    this.connectedAccount = next
    if (!next) return

    // A marker only ever means "this id's owner is not the connected wallet".
    // Naming that wallet again makes its ids current, so the markers have to
    // go: one left behind would retire the actor the moment it settles, and a
    // finished step's status, hash and gas are read straight off that
    // snapshot.
    for (const [id, owner] of this.transactionAccounts) {
      if (owner === next) this.retireOnceSettled.delete(id)
    }

    const foreign = [...this.transactionAccounts.entries()]
      .filter(([, owner]) => owner !== next)
      .map(([id]) => id)

    const retired = foreign.filter((id) => {
      if (this.retireTransaction(id)) return true
      // Still in flight: let it finish, then drop it (see terminal handling
      // in startTransaction's subscription).
      this.retireOnceSettled.add(id)
      return false
    })

    if (retired.length > 0) this.notifyListeners()
  }

  /**
   * Stop a settled actor and drop every trace of it from the in-memory maps.
   *
   * Refuses to touch an actor that is still in flight, and reports whether it
   * retired anything. Stopping a live actor would leave everything awaiting it
   * hanging and lose its history entry, while the transaction still lands
   * on-chain.
   *
   * Settled actors are otherwise kept after they are archived: the modal reads
   * a finished step's status, hash and actual gas cost straight off its
   * snapshot, so dropping one the moment it settles would make a completed
   * step render as "Not Started" and stall the flow. They are retired at the
   * flow's boundaries instead — a new attempt taking the same id, or an
   * account switch.
   */
  private retireTransaction(id: string): boolean {
    const actor = this.transactions.get(id)
    if (!actor) return false
    if (!isTransactionSettled(actor)) return false

    actor.stop()
    this.forgetTransaction(id)
    return true
  }

  /** Drops an id from every in-memory index. */
  private forgetTransaction(id: string): void {
    this.transactions.delete(id)
    this.transactionAccounts.delete(id)
    this.completedTelemetry.delete(id)
    this.retireOnceSettled.delete(id)
  }

  /**
   * Start a new transaction
   *
   * publicClient can be:
   * 1. Passed in options (takes priority)
   * 2. Pre-configured via setPublicClient() - determined by intent/request chainId or options.chainId
   * 3. If neither, throws an error
   *
   * @returns Transaction ID
   */
  startTransaction(
    intentOrRequest: TransactionIntent | TransactionRequest,
    signer: Signer,
    options: TransactionOptions & {
      publicClient?: PublicClient
      chainId?: number
      useSmartAccount?: boolean
    },
  ): string {
    const {
      publicClient: optionsPublicClient,
      chainId,
      useSmartAccount,
      ...transactionOptions
    } = options

    // Determine if this is an intent or a pre-prepared request
    const isIntent =
      'type' in intentOrRequest &&
      (intentOrRequest.type === 'ens-renewal' ||
        intentOrRequest.type === 'eth-transfer' ||
        intentOrRequest.type === 'custom')

    const intent = isIntent ? (intentOrRequest as TransactionIntent) : undefined
    const request = isIntent
      ? undefined
      : (intentOrRequest as TransactionRequest)

    // The chain this transaction runs on. Callers routinely omit `chainId`
    // from options even though the request they built carries one, so fall
    // back to it — telemetry already does the same (run-telemetry:449), and
    // an archived record without a chainId is dropped by history reporting.
    // Registration passes a custom intent, so its chain is on the embedded
    // request; the other intent variants carry no chain at all.
    const resolvedChainId =
      chainId ||
      request?.chainId ||
      (intent?.type === 'custom' ? intent.request.chainId : undefined)

    // Determine which publicClient to use (priority: options > stored > error)
    let publicClient = optionsPublicClient

    if (!publicClient && resolvedChainId) {
      // Try to get from stored clients using chainId
      publicClient = this.publicClients.get(resolvedChainId)
    }

    if (!publicClient) {
      throw new Error(
        'publicClient is required. Either pass it in options or pre-configure it with setPublicClient(chainId, client)',
      )
    }

    const txId = transactionOptions.id || generateTransactionId()

    // Ids are reused — by a flow retrying a step, and by any flow that names
    // its steps with a fixed string. A settled occupant must not survive under
    // the id: its snapshot would report this attempt's step as already done.
    // An occupant that is still in flight is the same work already under way
    // (a double-clicked start, say), so hand back the running transaction
    // rather than opening a second wallet prompt and orphaning the first.
    const existing = this.transactions.get(txId)
    if (existing && !this.retireTransaction(txId)) {
      logger.warn(
        `Transaction ${txId} is already in flight; ignoring duplicate start`,
      )
      return txId
    }

    // The id belongs to this attempt now, so it must not inherit a retirement
    // marker or a "terminal side effects already ran" flag. Retiring an
    // occupant clears both, but a hard reset empties the actor maps without
    // touching the markers: a stale retirement marker would retire this actor
    // as soon as it settled, and a stale completion flag would swallow this
    // run's archive, history report and telemetry.
    this.retireOnceSettled.delete(txId)
    this.completedTelemetry.delete(txId)

    // Create and start the transaction actor
    const actor = createActor(transactionMachine, {
      input: {
        intent,
        request,
        signer,
        publicClient,
        options: transactionOptions,
        chainId,
        useSmartAccount,
      },
    })

    this.runTelemetry.startRun({
      txId,
      chainId: resolvedChainId,
      intent,
      request:
        request || (intent?.type === 'custom' ? intent.request : undefined),
      signer,
      options: transactionOptions,
      useSmartAccount: Boolean(useSmartAccount),
    })

    actor.start()

    // Subscribe to actor state changes for persistence + telemetry
    actor.subscribe((snapshot) => {
      const state = getRootState(snapshot.value)
      const ctx = snapshot.context

      // Observability contract — do not remove. The portal registration e2e and
      // the shared console-monitor helper detect transaction progress and
      // terminal success by matching this exact
      // `[TRANSACTION MANAGER] Transaction <id> state: <state>` console line
      // (e.g. `Transaction tx-reg-register state: success`). It is load-bearing
      // for the tests, not stray debug logging.
      console.log(`📊 [TRANSACTION MANAGER] Transaction ${txId} state:`, state)

      const telemetryEvent = this.runTelemetry.recordSnapshot(txId, snapshot)
      if (telemetryEvent) {
        this.notifyTelemetryEventListeners(
          telemetryEvent.runId,
          txId,
          telemetryEvent.event,
        )
      }

      const persisted: PersistedTransaction = {
        id: txId,
        hash: ctx.hash,
        state,
        context: {
          // Prefer the machine-prepared request (ctx.request); the closure
          // `request` is only set for pre-prepared requests, not intents the
          // machine prepares internally (ens-renewal/eth-transfer).
          request: toPersistableRequest(ctx.request ?? request),
          error: ctx.error?.message,
        },
        timestamp: Date.now(),
        updatedAt: Date.now(),
      }

      const isTerminal = state === 'success' || state === 'error'

      if (!isTerminal) {
        // Keep the in-flight record in the active store.
        saveTransaction(txId, persisted).catch((err) =>
          logger.error(`Failed to save transaction ${txId}`, err),
        )
        return
      }

      this.completeTransaction({
        txId,
        chainId: resolvedChainId,
        state,
        snapshot,
        persisted,
        intent,
        request: ctx.request ?? request,
        options: transactionOptions,
      })
    })

    // Add to active transactions, remembering which wallet owns it so an
    // account switch can retire it (see setConnectedAccount).
    this.transactions.set(txId, actor)
    const owner = resolveOwnerAccount({ intent, request })
    if (owner) this.transactionAccounts.set(txId, owner)
    this.notifyListeners()

    return txId
  }

  /**
   * The completion side effects for a terminal actor, run exactly once:
   * move its record to the history store, report it, and close its telemetry
   * run. Extracted from the subscription so the per-snapshot path stays small.
   */
  private completeTransaction(input: {
    txId: string
    chainId?: number
    state: string
    snapshot: { value: unknown; context: { hash?: Hash; error?: Error } }
    persisted: PersistedTransaction
    intent?: TransactionIntent
    request?: TransactionRequest
    options: TransactionOptions
  }): void {
    const { txId, state, snapshot, persisted } = input

    if (this.completedTelemetry.has(txId)) return
    this.completedTelemetry.add(txId)

    const status: TransactionRunStatus =
      state === 'success'
        ? 'success'
        : isCancelledState(snapshot.value)
          ? 'cancelled'
          : 'error'

    // Move the record from the active store to the history store.
    archiveTransaction(persisted).catch((err) =>
      logger.error(`Failed to archive transaction ${txId}`, err),
    )

    // Report the terminal transaction (apps wire this to a backend).
    this.notifyTransactionArchived(
      buildArchivedTransaction({
        txId,
        chainId: input.chainId,
        status,
        hash: snapshot.context.hash,
        error: snapshot.context.error?.message,
        operation: input.options.operation,
        name: input.options.name,
        intent: input.intent,
        request: input.request,
        timestamp: Date.now(),
      }),
    )

    const payload = this.runTelemetry.completeRun(txId, status)
    if (payload) this.notifyTelemetryListeners(payload)

    // Belongs to a wallet that has since been swapped out. It has now archived
    // and told its waiters, so it can go (see setConnectedAccount).
    if (this.retireOnceSettled.has(txId)) {
      this.retireTransaction(txId)
      this.notifyListeners()
    }
  }

  /**
   * Cancel a transaction
   */
  cancelTransaction(id: string): void {
    const actor = this.transactions.get(id)
    if (actor) {
      actor.send({ type: 'CANCEL' })
    }

    // Remove from active transactions
    this.forgetTransaction(id)
    this.notifyListeners()

    // Remove from persistence
    removeTransaction(id).catch((err) =>
      logger.error(`Failed to remove cancelled transaction ${id}`, err),
    )
  }

  /**
   * Get a specific transaction actor by ID
   */
  getTransaction(
    id: string,
  ): ActorRefFrom<typeof transactionMachine> | undefined {
    return this.transactions.get(id)
  }

  /**
   * Get all active transactions
   */
  getTransactions(): Map<string, ActorRefFrom<typeof transactionMachine>> {
    return new Map(this.transactions)
  }

  /**
   * Subscribe to transaction changes (for React integration)
   *
   * @returns Unsubscribe function
   */
  onTransactionsChange(listener: TransactionChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Subscribe to terminal transactions as they are archived.
   *
   * This is the seam an app uses to persist transaction history to a backend
   * (e.g. a user's account), keeping the core package backend-agnostic.
   *
   * @returns Unsubscribe function
   */
  onTransactionArchived(listener: TransactionArchivedListener): () => void {
    this.archivedListeners.add(listener)
    return () => {
      this.archivedListeners.delete(listener)
    }
  }

  onFailedRunTelemetry(listener: RunTelemetrySubscriber): () => void {
    this.telemetryListeners.add(listener)
    return () => {
      this.telemetryListeners.delete(listener)
    }
  }

  onRunTelemetryEvent(listener: RunTelemetryEventSubscriber): () => void {
    this.telemetryEventListeners.add(listener)
    return () => {
      this.telemetryEventListeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of transaction changes
   */
  private notifyListeners(): void {
    const txCopy = this.getTransactions()
    this.listeners.forEach((listener) => {
      listener(txCopy)
    })
  }

  private notifyTransactionArchived(transaction: ArchivedTransaction): void {
    this.archivedListeners.forEach((listener) => {
      try {
        listener(transaction)
      } catch (error) {
        logger.error('Transaction archived listener crashed', error)
      }
    })
  }

  private notifyTelemetryListeners(payload: FailedRunPayloadV2): void {
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(payload)
      } catch (error) {
        logger.error('Failed run telemetry listener crashed', error)
      }
    })
  }

  private notifyTelemetryEventListeners(
    runId: string,
    txId: string,
    event: TransactionRunEventV2,
  ): void {
    this.telemetryEventListeners.forEach((listener) => {
      try {
        listener({
          runId,
          txId,
          status:
            event.phase === 'success'
              ? 'success'
              : event.phase === 'error' && event.substate === 'cancelled'
                ? 'cancelled'
                : event.phase === 'error'
                  ? 'error'
                  : undefined,
          event,
        })
      } catch (error) {
        logger.error('Telemetry event listener crashed', error)
      }
    })
  }

  /**
   * Stop and forget every actor, in flight or not — a hard reset.
   *
   * This is deliberately blunt and reaches outside any one flow, so it is not
   * the way to keep a new attempt from matching an old actor: scope the
   * attempt's ids instead ({@link createFlowScope}). Anything awaiting an
   * actor stopped here is rejected with a `TransactionStoppedError`, and the
   * transaction itself may still land on-chain.
   */
  clear(): void {
    this.transactions.forEach((actor) => {
      actor.stop()
    })
    this.transactions.clear()
    this.transactionAccounts.clear()
    this.completedTelemetry.clear()
    this.retireOnceSettled.clear()
    this.runTelemetry.clear()
    this.notifyListeners()
  }

  /**
   * Cancel and clear all active transactions and persistence
   */
  async clearAllAndPersistence(): Promise<void> {
    this.transactions.forEach((actor) => {
      actor.send({ type: 'CANCEL' })
      actor.stop()
    })

    this.transactions.clear()
    this.transactionAccounts.clear()
    this.completedTelemetry.clear()
    this.retireOnceSettled.clear()
    this.runTelemetry.clear()
    this.notifyListeners()

    try {
      await clearAllTransactions()
    } catch (err) {
      logger.error('Failed to clear persisted transactions', err)
    }
  }
}

// Export singleton instance
export const transactionManager = new TransactionManager()
