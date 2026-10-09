/**
 * Wait for the local bigname to catch up — the manager's counterpart of
 * `indexer-sync.ts` (which waits for Panoptes, still the portal's indexer).
 *
 * The manager reads every name list, name detail and V1 migration candidate
 * from bigname. Locally that is a bigname following the Anvil fork
 * (`e2e/infra/bigname`); in CI it is Playwright's route mock
 * (`E2E_MOCK_INDEXER=true`, `helpers/mock-indexer.ts`), and every function
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
export const isRealBigname = process.env.E2E_MOCK_INDEXER !== 'true'

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
