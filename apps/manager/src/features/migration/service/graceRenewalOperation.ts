import { errAsync, fromPromise } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Hex } from 'viem'
import {
  type executeGraceRenewal,
  GraceRenewalError,
  type GraceRenewalQuote,
  type GraceRenewalStatus,
} from './graceRenewal'
import type { PendingGraceRenewal } from './graceRenewalPending'

type Progress =
  | { readonly kind: 'status'; readonly status: GraceRenewalStatus }
  | { readonly kind: 'approval'; readonly required: boolean }
  | { readonly kind: 'submitted'; readonly hash: Hex }

type Run = typeof executeGraceRenewal
type Subscriber = Readonly<Parameters<Run>[0]> & {
  readonly selection: readonly string[]
  readonly onQuoteRecovered?: (quote: GraceRenewalQuote) => void
}

type Operation = {
  readonly quote: GraceRenewalQuote
  readonly selection: readonly string[]
  readonly completion: ReturnType<Run>
  readonly subscriber: Subscriber | undefined
  readonly progress: readonly Progress[]
}

// Each document owns its registry; every new operation still acquires the
// browser lock. Replacing snapshots only changes this document's subscribers.
let operations: ReadonlyMap<string, Operation> = new Map()
const save = (key: string, operation: Operation): void => {
  operations = new Map([...operations, [key, operation]])
}

type SelectionIdentity = {
  readonly quote: Pick<
    GraceRenewalQuote,
    'chainId' | 'ownerAddress' | 'paymentToken' | 'renewerAddress'
  >
  readonly selection: readonly string[]
}

const isSameRenewalSelection = (
  left: SelectionIdentity,
  right: SelectionIdentity,
): boolean => {
  const selected = new Set(right.selection.map((id) => id.toLowerCase()))
  return (
    left.quote.chainId === right.quote.chainId &&
    left.quote.ownerAddress.toLowerCase() ===
      right.quote.ownerAddress.toLowerCase() &&
    left.quote.paymentToken.toLowerCase() ===
      right.quote.paymentToken.toLowerCase() &&
    left.quote.renewerAddress.toLowerCase() ===
      right.quote.renewerAddress.toLowerCase() &&
    left.selection.length === right.selection.length &&
    selected.size === right.selection.length &&
    left.selection.every((id) => selected.has(id.toLowerCase()))
  )
}

const notify = (subscriber: Subscriber, progress: Progress): void => {
  match(progress)
    .with({ kind: 'status' }, ({ status }) => subscriber.onStatus?.(status))
    .with({ kind: 'approval' }, ({ required }) =>
      subscriber.onApprovalRequired?.(required),
    )
    .with({ kind: 'submitted' }, ({ hash }) =>
      subscriber.onRenewalSubmitted?.(hash),
    )
    .exhaustive()
}

const subscribe = (
  key: string,
  operation: Operation,
  subscriber: Subscriber,
): void => {
  save(key, { ...operation, subscriber })
  const detach = () => {
    const current = operations.get(key)
    if (current?.subscriber === subscriber)
      save(key, { ...current, subscriber: undefined })
  }
  subscriber.signal?.addEventListener('abort', detach, { once: true })
  void operation.completion.then(() =>
    subscriber.signal?.removeEventListener('abort', detach),
  )
  for (const progress of operation.progress) notify(subscriber, progress)
}

const confirmDiscard = (
  subscriber: Subscriber | undefined,
  pending: PendingGraceRenewal,
): Promise<boolean> => {
  const confirm = subscriber?.confirmDiscardUnsubmittedRenewal
  const signal = subscriber?.signal
  if (!confirm || signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    const cancel = () => resolve(false)
    signal?.addEventListener('abort', cancel, { once: true })
    void Promise.resolve()
      .then(() => (signal?.aborted ? false : confirm(pending)))
      .then(
        (confirmed) => {
          signal?.removeEventListener('abort', cancel)
          resolve(confirmed && !signal?.aborted)
        },
        (cause: unknown) => {
          signal?.removeEventListener('abort', cancel)
          reject(cause)
        },
      )
  })
}

export const observeGraceRenewalOperation = (
  params: Subscriber,
  run: Run,
): ReturnType<Run> => {
  if (params.signal?.aborted)
    return errAsync(new GraceRenewalError({ cause: params.signal.reason }))
  const key = `${params.quote.chainId}:${params.quote.ownerAddress.toLowerCase()}`
  const existing = operations.get(key)
  if (existing) {
    if (existing.subscriber)
      return errAsync(
        new GraceRenewalError({
          cause: new Error('A renewal is already running in this tab.'),
        }),
      )
    if (!isSameRenewalSelection(existing, params))
      return errAsync(
        new GraceRenewalError({
          cause: new Error(
            'A previous renewal is still running for a different selection. Return to its name selection to finish it.',
          ),
        }),
      )
    params.onQuoteRecovered?.(existing.quote)
    subscribe(key, existing, params)
    return existing.completion
  }

  const emit = (progress: Progress) => {
    const current = operations.get(key)
    if (!current) return
    save(key, { ...current, progress: [...current.progress, progress] })
    if (current.subscriber) notify(current.subscriber, progress)
  }
  const completion = fromPromise(
    Promise.resolve()
      .then(() =>
        run({
          ...params,
          // Screen cleanup detaches its subscriber. Wallet requests and receipts
          // keep ownership until they settle, including a late transaction hash.
          signal: undefined,
          isAttached: () => operations.get(key)?.subscriber !== undefined,
          onStatus: (status) => emit({ kind: 'status', status }),
          onApprovalRequired: (required) =>
            emit({ kind: 'approval', required }),
          onRenewalSubmitted: (hash) => emit({ kind: 'submitted', hash }),
          confirmDiscardUnsubmittedRenewal: (pending) =>
            confirmDiscard(operations.get(key)?.subscriber, pending),
        }),
      )
      .finally(() => {
        operations = new Map([...operations].filter(([scope]) => scope !== key))
      }),
    (cause) => new GraceRenewalError({ cause }),
  ).andThen((result) => result)
  const operation: Operation = {
    quote: params.quote,
    selection: params.selection,
    completion,
    subscriber: undefined,
    progress: [],
  }
  subscribe(key, operation, params)
  return completion
}
