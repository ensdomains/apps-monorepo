import type {
  FailedRunPayloadV1,
  TransactionRunEvent,
  TransactionRunStatus,
} from '../types/audit.types'

const MAX_TELEMETRY_BYTES = 900 * 1024

interface RunStaticMeta {
  chainId?: number
  requestType?: string
  signerType?: string
}

interface RunData {
  runId: string
  txId: string
  startedAt: number
  chainId?: number
  requestType?: string
  signerType?: string
  events: TransactionRunEvent[]
}

interface SnapshotLike {
  value: unknown
  context: {
    hash?: string
    error?: unknown
    retryCount?: number
    chainId?: number
    request?: { type?: string }
    signer?: { type?: string }
  }
}

function randomId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function serializeError(
  error: unknown,
): { name?: string; message?: string; stack?: string } | undefined {
  if (!error) return undefined

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
    }
  }

  if (typeof error === 'object') {
    const objectError = error as Record<string, unknown>
    return {
      name: typeof objectError.name === 'string' ? objectError.name : undefined,
      message:
        typeof objectError.message === 'string'
          ? objectError.message
          : JSON.stringify(error),
      stack:
        typeof objectError.stack === 'string' ? objectError.stack : undefined,
    }
  }

  return {
    message: String(error),
  }
}

function stringifyState(stateValue: unknown): string {
  if (typeof stateValue === 'string') return stateValue
  try {
    return JSON.stringify(stateValue)
  } catch {
    return String(stateValue)
  }
}

function normalizeEvent(
  snapshot: SnapshotLike,
  triggerEventType?: string,
): TransactionRunEvent {
  return {
    timestamp: Date.now(),
    state: stringifyState(snapshot.value),
    eventType: triggerEventType,
    hash: snapshot.context.hash,
    error: serializeError(snapshot.context.error),
    retryCount: snapshot.context.retryCount ?? 0,
    chainId: snapshot.context.chainId,
    requestType: snapshot.context.request?.type,
    signerType: snapshot.context.signer?.type,
  }
}

export function estimateTelemetryBytes(payload: unknown): number {
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  return encoded.byteLength
}

export function createRunTelemetryService() {
  const runs = new Map<string, RunData>()

  function startRun(txId: string, staticMeta?: RunStaticMeta): void {
    runs.set(txId, {
      runId: randomId(),
      txId,
      startedAt: Date.now(),
      chainId: staticMeta?.chainId,
      requestType: staticMeta?.requestType,
      signerType: staticMeta?.signerType,
      events: [],
    })
  }

  function recordSnapshot(
    txId: string,
    snapshot: SnapshotLike,
    triggerEventType?: string,
  ): void {
    const run = runs.get(txId)
    if (!run) return

    if (!run.chainId) {
      run.chainId = snapshot.context.chainId
    }
    if (!run.requestType) {
      run.requestType = snapshot.context.request?.type
    }
    if (!run.signerType) {
      run.signerType = snapshot.context.signer?.type
    }

    run.events.push(normalizeEvent(snapshot, triggerEventType))
  }

  function sizeFitPayload(
    payload: FailedRunPayloadV1,
    maxBytes: number,
  ): FailedRunPayloadV1 {
    if (estimateTelemetryBytes(payload) <= maxBytes) return payload

    const sourceEvents = payload.events
    let head = Math.min(20, sourceEvents.length)
    let tail = Math.min(40, Math.max(0, sourceEvents.length - head))
    const pickEvents = (headCount: number, tailCount: number) => {
      if (headCount + tailCount >= sourceEvents.length) {
        return sourceEvents.slice()
      }
      return sourceEvents
        .slice(0, headCount)
        .concat(sourceEvents.slice(sourceEvents.length - tailCount))
    }
    let selected = pickEvents(head, tail)

    const build = (events: TransactionRunEvent[]): FailedRunPayloadV1 => ({
      ...payload,
      truncated: true,
      droppedEvents: sourceEvents.length - events.length,
      events,
    })

    while (
      selected.length > 1 &&
      estimateTelemetryBytes(build(selected)) > maxBytes
    ) {
      if (tail > head && tail > 1) {
        tail -= 1
      } else if (head > 1) {
        head -= 1
      } else if (tail > 1) {
        tail -= 1
      } else {
        break
      }
      selected = pickEvents(head, tail)
    }

    if (estimateTelemetryBytes(build(selected)) <= maxBytes) {
      return build(selected)
    }

    const fallbackEvents =
      sourceEvents.length > 0 ? [sourceEvents[sourceEvents.length - 1]!] : []
    return build(fallbackEvents)
  }

  function completeRun(
    txId: string,
    terminalStatus: TransactionRunStatus,
  ): FailedRunPayloadV1 | null {
    const run = runs.get(txId)
    runs.delete(txId)
    if (!run) return null
    if (terminalStatus === 'success') return null

    const endedAt = Date.now()
    const finalEvent = run.events[run.events.length - 1]
    const payload: FailedRunPayloadV1 = {
      schemaVersion: 'tm-failed-run-v1',
      runId: run.runId,
      txId,
      status: terminalStatus,
      startedAt: run.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - run.startedAt),
      eventCount: run.events.length,
      truncated: false,
      droppedEvents: 0,
      events: run.events,
      summary: {
        finalState: finalEvent?.state || 'unknown',
        finalError: finalEvent?.error,
        chainId: run.chainId,
        requestType: run.requestType,
        signerType: run.signerType,
      },
    }

    return sizeFitPayload(payload, MAX_TELEMETRY_BYTES)
  }

  return {
    startRun,
    recordSnapshot,
    completeRun,
    clear: () => {
      runs.clear()
    },
  }
}
