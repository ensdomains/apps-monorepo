/**
 * Builds and HMAC-signs `EnsNameEvent` webhook payloads for the metadata
 * service's `POST /webhook` — the cache-invalidation entrypoint documented in
 * metadata-service-v2's `docs/webhook.md` (pinned commit — see
 * `infra/Dockerfile.metadata-service`).
 *
 * The endpoint is sender-agnostic (any backend that can produce a correctly
 * signed event may call it — indexer, backfill job, or, here, a test), so
 * driving it directly is the documented way to trigger invalidation
 * deterministically instead of waiting out the real ~1h TTL (see MD5).
 *
 * Signing algorithm, verbatim from docs/webhook.md:
 *   key       = hex-decode(secret) if secret is valid hex, else utf8 bytes
 *   signature = HMAC-SHA256(key, `${timestampSeconds}.${rawBody}`)
 *   header    = `sha256=${hex(signature)}`
 */
import crypto from 'node:crypto'

/** Must match `WEBHOOK_SECRET` set on the `metadata-service` container in docker-compose.yml. */
const DEFAULT_WEBHOOK_SECRET =
  process.env.METADATA_SERVICE_WEBHOOK_SECRET ?? 'e2e0'.repeat(16)

export type EnsProtocol = 'v1' | 'v2'

export interface EnsNameEvent {
  event_type: string
  /** ENS *version*, not the chain: `v2` → sepolia, `v1` → mainnet. */
  protocol: EnsProtocol
  name: string | null
  namehash: string | null
  block_number: number
  tx_hash: string
  log_index: number
  contract_address: string
  data: string
  timestamp: number
}

function hmacKey(secret: string): Buffer {
  const isHex =
    secret.length > 0 &&
    secret.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(secret)
  return isHex ? Buffer.from(secret, 'hex') : Buffer.from(secret, 'utf8')
}

/** Fill in the boilerplate fields a name-keyed cache-invalidation event doesn't need to vary. */
export function makeNameEvent(
  overrides: Partial<EnsNameEvent> & { name: string; protocol: EnsProtocol },
): EnsNameEvent {
  return {
    event_type: 'AvatarUpdated',
    namehash: null,
    block_number: 0,
    tx_hash: '0x',
    log_index: 0,
    contract_address: '0x',
    data: '{}',
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

export interface SignedWebhookRequest {
  rawBody: string
  headers: Record<string, string>
}

/** Serialize + sign an event once — the same bytes must be sent as were signed. */
export function signWebhookEvent(
  event: EnsNameEvent,
  secret: string = DEFAULT_WEBHOOK_SECRET,
): SignedWebhookRequest {
  const rawBody = JSON.stringify(event)
  const signature = crypto
    .createHmac('sha256', hmacKey(secret))
    .update(`${event.timestamp}.${rawBody}`)
    .digest('hex')

  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'x-webhook-timestamp': String(event.timestamp),
      'x-webhook-signature': `sha256=${signature}`,
    },
  }
}
