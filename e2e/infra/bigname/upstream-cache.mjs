// A caching JSON-RPC proxy for Anvil's fork upstream.
//
// Anvil forks a pinned block (start-local-env.sh), so everything it asks the
// upstream names that block explicitly — the fork block's header, code,
// storage slots, balances and nonces at that height — and the answer can never
// change. This keeps each answer on disk (CACHE_DIR) and serves it from there
// afterwards. Anvil's own storage.json cache is not enough on its own: Anvil
// still fetches the fork block's header from the network to start.
//
// Requests that name a moving tag (latest, pending, safe, finalized) are
// passed through uncached.
//
// Offline mode only serves confirmed cached values. A missing value is an
// error; no unknown storage, receipt or log is fabricated as empty.
// Online requests are rate-limited and retried without weakening that rule.
//
// Zero dependencies; node:22 runs it as is.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8548)
const UPSTREAM = process.env.UPSTREAM_RPC_URL
const OFFLINE = process.env.UPSTREAM_CACHE_OFFLINE === '1'
const CACHE_DIR = process.env.CACHE_DIR ?? '/cache'
if (!UPSTREAM && !OFFLINE)
  throw new Error('UPSTREAM_RPC_URL is required (or UPSTREAM_CACHE_OFFLINE=1)')
await mkdir(CACHE_DIR, { recursive: true })

const MOVING = new Set(['latest', 'pending', 'safe', 'finalized', 'earliest'])
const stats = { hits: 0, misses: 0, emptied: 0, nonEmpty: 0 }
const inFlight = new Map()

const ZERO_WORD = `0x${'0'.repeat(64)}`
/** The empty answer for a read that asks what is there; undefined otherwise. */
const EMPTY = {
  eth_getStorageAt: ZERO_WORD,
  eth_getBalance: '0x0',
  eth_getTransactionCount: '0x0',
  eth_getCode: '0x',
  eth_getTransactionByHash: null,
  eth_getTransactionReceipt: null,
  eth_getLogs: [],
}
const hasEmpty = (method) => Object.hasOwn(EMPTY, method)
/**
 * Omit the frequent EIP-2935 block-hash reads from verbose miss logging.
 * Their real upstream values are still fetched and cached; no replacement
 * value is supplied for a missing slot.
 */
const UNCHECKED = new Set(['0x0000f90827f1c53a10cb7a02335b175320002935'])
const checked = ({ params = [] }) =>
  !UNCHECKED.has(String(params[0]).toLowerCase())
/** Same value, ignoring how a number is padded ("0x0" vs "0x000…0"). */
const isEmptyValue = (method, result) => {
  if (result == null) return EMPTY[method] == null
  if (Array.isArray(result)) return result.length === 0
  if (typeof result === 'string' && /^0x[0-9a-f]*$/i.test(result))
    return method === 'eth_getCode'
      ? result === '0x'
      : BigInt(result || '0x0') === 0n
  return false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cacheable = ({ params = [] }) =>
  !JSON.stringify(params)
    .match(/"([a-z]+)"/g)
    ?.some((m) => MOVING.has(m.slice(1, -1)))

const cachePath = ({ method, params = [] }) =>
  path.join(
    CACHE_DIR,
    `${createHash('sha256')
      .update(`${method}:${JSON.stringify(params)}`)
      .digest('hex')}.json`,
  )

async function cached(request) {
  if (!cacheable(request)) return undefined
  try {
    return JSON.parse(await readFile(cachePath(request), 'utf8'))
  } catch {
    return undefined
  }
}

async function store(request, reply) {
  if (!cacheable(request) || reply.error || reply.result == null) return
  const file = cachePath(request)
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(tmp, JSON.stringify(reply.result))
  await rename(tmp, file)
}

// Serialize outbound calls and respect a modest request rate. Historical
// index backfill must not cause a transient 429 to crash Anvil's miner.
const stateMethods = new Set([
  'eth_getStorageAt',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getCode',
  'eth_call',
])
const stateQueue = []
const historyQueue = []
let draining = false
let consecutiveStateReads = 0
async function drain() {
  if (draining) return
  draining = true
  try {
    while (stateQueue.length || historyQueue.length) {
      // A large historical block must not starve the storage read required
      // to mine the next local block. Still admit one historical request
      // after four state reads, with the same global rate limit and retries.
      const useState =
        stateQueue.length && (!historyQueue.length || consecutiveStateReads < 4)
      const next = (useState ? stateQueue : historyQueue).shift()
      consecutiveStateReads = useState ? consecutiveStateReads + 1 : 0
      try {
        next.resolve(await next.request())
      } catch (error) {
        next.reject(error)
      }
    }
  } finally {
    draining = false
  }
}
const interval = Number(process.env.UPSTREAM_MIN_INTERVAL_MS ?? 150)
async function post(body) {
  const request = async () => {
    let lastError
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const res = await fetch(UPSTREAM, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        })
        if (!res.ok) throw new Error(`upstream answered ${res.status}`)
        const reply = await res.json()
        if (
          reply.error &&
          /rate|limit|timeout|temporar/i.test(reply.error.message ?? '')
        )
          throw new Error(`transient upstream RPC error ${reply.error.code}`)
        await sleep(interval)
        return reply
      } catch (error) {
        lastError = error
        await sleep(Math.min(15000, 1000 * 2 ** attempt))
      }
    }
    console.error(`[upstream-cache] giving up: ${lastError.message}`)
    throw lastError
  }
  return new Promise((resolve, reject) => {
    const queue = stateMethods.has(body.method) ? stateQueue : historyQueue
    queue.push({ request, resolve, reject })
    void drain()
  })
}

async function answerUncached(request) {
  const hit = await cached(request)
  if (hit !== undefined) {
    stats.hits++
    return { jsonrpc: '2.0', id: request.id, result: hit }
  }
  stats.misses++
  if (OFFLINE) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `upstream-cache offline: no cached answer for ${request.method}`,
      },
    }
  }
  const reply = await post(request)
  await store(request, reply)
  if (
    hasEmpty(request.method) &&
    checked(request) &&
    !reply.error &&
    !isEmptyValue(request.method, reply.result)
  ) {
    stats.nonEmpty++
    console.log(
      `[upstream-cache] non-empty first read: ${request.method} ${JSON.stringify(request.params).slice(0, 160)}`,
    )
  }
  return reply
}

async function answer(request) {
  // Only identical immutable reads share work. Preserve each caller's id;
  // moving tags remain independent and no missing value is invented.
  if (!cacheable(request)) return answerUncached(request)
  const key = cachePath(request)
  let pending = inFlight.get(key)
  if (!pending) {
    pending = answerUncached(request).finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  return { ...(await pending), id: request.id }
}

const server = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const parsed = JSON.parse(body)
    const reply = Array.isArray(parsed)
      ? await Promise.all(parsed.map(answer))
      : await answer(parsed)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply))
  } catch (error) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: `upstream-cache: ${error.message}` },
      }),
    )
  }
})

setInterval(() => {
  if (stats.hits + stats.misses === 0) return
  console.log(
    `[upstream-cache] ${stats.hits} hits, ${stats.misses} misses` +
      (OFFLINE
        ? `, ${stats.emptied} answered empty`
        : `, ${stats.nonEmpty} non-empty first reads`),
  )
  stats.hits = 0
  stats.misses = 0
  stats.emptied = 0
  stats.nonEmpty = 0
}, 60_000)
server.listen(PORT, () =>
  console.log(
    `[upstream-cache] :${PORT} → ${UPSTREAM ? new URL(UPSTREAM).host : '(none)'} cache ${CACHE_DIR}${OFFLINE ? ' OFFLINE' : ''}`,
  ),
)
