/**
 * Read an intent operation's status straight off the orchestrator.
 *
 * `GET /intent-operation/{id}` is the only per-intent lookup the orchestrator
 * offers (the list endpoint ignores its `userAddress` filter and pages the
 * whole workspace), so callers must hold the intent id — the warp transport
 * surfaces it via `onIntentSubmitted` the moment an intent is accepted.
 *
 * Used by the registration resume path to distinguish "still filling" from
 * "dead" without sitting out the on-chain verification grace window.
 */

/** Statuses the orchestrator reports (SDK `IntentOpStatus`). */
export type IntentOperationStatus =
  | 'PENDING'
  | 'PRECONFIRMED'
  | 'FILLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'

/** The prod orchestrator; override with the local mockestrator in e2e. */
const DEFAULT_ORCHESTRATOR_URL = 'https://v1.orchestrator.rhinestone.dev'

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
  'PRECONFIRMED',
  'FILLED',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
] satisfies IntentOperationStatus[])

/**
 * Fetch the status of one intent operation.
 *
 * Returns `null` for every inconclusive outcome — unknown id, endpoint
 * unreachable, unrecognized status value — because the caller's fallback (the
 * blind on-chain grace poll) is always safe, while acting on a wrong "dead"
 * verdict is not.
 */
export async function fetchIntentOperationStatus(params: {
  readonly intentId: bigint
  readonly apiKey: string
  /** Orchestrator base URL; defaults to the prod deployment. */
  readonly endpointUrl?: string
  readonly signal?: AbortSignal
}): Promise<IntentOperationStatus | null> {
  const base = (params.endpointUrl ?? DEFAULT_ORCHESTRATOR_URL).replace(
    /\/$/,
    '',
  )

  try {
    const response = await fetch(
      `${base}/intent-operation/${params.intentId.toString()}`,
      {
        headers: { 'x-api-key': params.apiKey },
        signal: params.signal ?? null,
      },
    )
    if (!response.ok) return null

    const body: unknown = await response.json()
    const status =
      body && typeof body === 'object' && 'status' in body
        ? (body as { status: unknown }).status
        : undefined

    return typeof status === 'string' && KNOWN_STATUSES.has(status)
      ? (status as IntentOperationStatus)
      : null
  } catch {
    return null
  }
}
