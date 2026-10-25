/**
 * Wait for the local bigname to catch up — the manager's counterpart of
 * `indexer-sync.ts` (which waits for Panoptes, still the portal's indexer).
 *
 * The manager reads every name list, name detail and V1 migration candidate
 * from bigname. Locally that is a bigname following the Anvil fork
 * (`e2e/infra/bigname`); in CI it is Playwright's route mock
 * (`E2E_MOCK_BIGNAME=true`, `helpers/mock-bigname.ts`), and every function
 * here returns at once.
 *
 * Same failure mode as Panoptes: a page that reads before the index has the
 * write gets an empty answer, react-query caches it, and the page stays empty
 * for the rest of the test. Wait first, as for a transaction receipt.
 */

import { publicClient } from './anvil-client.js'

const BIGNAME_URL = process.env.E2E_BIGNAME_URL ?? 'http://127.0.0.1:5660'
const SEPOLIA = '11155111'
const DEFAULT_TIMEOUT_MS = 60_000
const POLL_MS = 500

/** Whether the manager reads a real bigname (false when the mock answers). */
export const isRealBigname = process.env.E2E_MOCK_BIGNAME !== 'true'

/** The bigname name record fields the e2e suite waits on. */
export type BignameName = {
  readonly name: string
  readonly status?: string
  readonly authority?: 'ens_v0' | 'ens_v1' | 'ens_v2'
  readonly owner?: string
  readonly registrant?: string
  readonly manager?: string
  readonly expires_at?: string
  readonly ens_v1?: { readonly expires_at?: string | null }
  readonly migrated_at?: string
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BIGNAME_URL}${path}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    // Unreachable is a state to wait through: the API may still be starting.
    return null
  }
}

/** The highest block bigname has published, or null if it is unreachable. */
export async function indexedBlock(): Promise<bigint | null> {
  const status = await getJson<{
    data?: { chains?: Record<string, { indexed_block?: number | null }> }
  }>('/v1/status')
  const block = status?.data?.chains?.[SEPOLIA]?.indexed_block
  return block == null ? null : BigInt(block)
}

/**
 * Block until bigname has published `minBlock` (default: the current head).
 * After any write this covers every name the write touched.
 */
export async function waitForBignameBlock(
  minBlock?: bigint,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (!isRealBigname) return
  const target = minBlock ?? (await publicClient.getBlockNumber())
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const indexed = await indexedBlock()
    if (indexed !== null && indexed >= target) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `bigname did not publish block ${target} within ${timeoutMs}ms ` +
      `(indexed: ${await indexedBlock()}). Check the runner: docker compose ` +
      `-f e2e/infra/docker-compose.yml --profile bigname logs bigname-runner`,
  )
}

/** bigname's record for `name`, or null when it does not know the name. */
export async function bignameName(name: string): Promise<BignameName | null> {
  const body = await getJson<{ data?: BignameName }>(
    `/v1/names/${encodeURIComponent(name)}`,
  )
  return body?.data ?? null
}

/**
 * Block until bigname serves `name` and `accept` holds for its record, e.g.
 * `(n) => n.authority === 'ens_v2'` after a migration.
 */
export async function waitForBignameName(
  name: string,
  accept: (record: BignameName) => boolean = () => true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BignameName | null> {
  if (!isRealBigname) return null
  const deadline = Date.now() + timeoutMs
  let last: BignameName | null = null
  while (Date.now() < deadline) {
    last = await bignameName(name)
    if (last && accept(last)) return last
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `bigname did not serve ${name} as expected within ${timeoutMs}ms; ` +
      `last record: ${JSON.stringify(last)}`,
  )
}

/** Wait for each name, in order. */
export async function waitForBignameNames(
  names: readonly string[],
  accept?: (record: BignameName) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  for (const name of names) await waitForBignameName(name, accept, timeoutMs)
}

/** The record keys bigname lists for a name — what migration replays from. */
export type BignameRecordKeys = {
  readonly texts?: readonly string[]
  readonly coinTypes?: readonly number[]
  readonly contentHash?: boolean
  readonly abiContentTypes?: readonly number[]
}

async function lookupRecordKeys(name: string) {
  try {
    const res = await fetch(`${BIGNAME_URL}/v1/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        namespace: 'ens',
        profile: 'detail',
        inputs: [{ name }],
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      data?: {
        record?: {
          records?: {
            seen_texts?: string[]
            seen_addresses?: string[]
            seen_singletons?: string[]
            seen_abis?: string[]
          }
        }
      }[]
    }
    return body.data?.[0]?.record?.records ?? null
  } catch {
    return null
  }
}

type SeenKeys = NonNullable<Awaited<ReturnType<typeof lookupRecordKeys>>>

/** The keys in `expected` that bigname does not list yet. */
function missingKeys(
  keys: SeenKeys | null,
  expected: BignameRecordKeys,
): string[] {
  const texts = new Set(keys?.seen_texts ?? [])
  const coins = new Set(keys?.seen_addresses ?? [])
  const abis = new Set(keys?.seen_abis ?? [])
  const hasContentHash = (keys?.seen_singletons ?? []).includes('contenthash')
  return [
    ...(expected.texts ?? []).filter((k) => !texts.has(k)),
    ...(expected.coinTypes ?? [])
      .filter((c) => !coins.has(String(c)))
      .map((c) => `coin ${c}`),
    ...(expected.contentHash && !hasContentHash ? ['contenthash'] : []),
    ...(expected.abiContentTypes ?? [])
      .filter((t) => !abis.has(String(t)))
      .map((t) => `abi ${t}`),
  ]
}

/**
 * Block until bigname lists every record key in `expected` for `name`.
 *
 * Migration learns which records exist from these keys and replays only
 * those, so a page that reads before bigname has projected them migrates the
 * name with nothing replayed. Publishing the block is not enough: in a busy
 * full-suite run the keys were measured to arrive after it (GR8, 2026-10-11).
 */
export async function waitForBignameRecordKeys(
  name: string,
  expected: BignameRecordKeys,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (!isRealBigname) return
  const started = Date.now()
  const deadline = started + timeoutMs
  let missing: string[] = []
  while (Date.now() < deadline) {
    const keys = await lookupRecordKeys(name)
    missing = missingKeys(keys, expected)
    if (keys && missing.length === 0) {
      const waited = Date.now() - started
      if (waited > POLL_MS)
        console.log(
          `[bigname-sync] ${name}: record keys arrived after ${waited}ms`,
        )
      return
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `bigname did not list ${name}'s record keys within ${timeoutMs}ms; missing: ${missing.join(', ')}`,
  )
}
