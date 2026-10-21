// A fork-aware JSON-RPC router for bigname's phase-runner.
//
// The runner backfills by asking for every block header and every log in its
// range. Sent to Anvil, each of those is forwarded one at a time to the
// upstream Sepolia RPC, and a backfill of a few thousand blocks wedges Anvil
// for every other client, the e2e suite included (measured: eth_blockNumber
// timing out after 30s). Blocks at or below Anvil's fork block are identical
// upstream, so this sends those reads straight there and everything else
// (local blocks, the latest/safe/finalized tags, local transactions) to
// Anvil.
//
// Every upstream answer it uses describes a block at or below the fork, which
// never changes, so it is kept on disk (CACHE_DIR) and served from there on
// every later reset. With a pinned fork block (start-local-env.sh) a warmed
// cache makes the whole stack independent of the public RPC; set
// FORK_RPC_OFFLINE=1 to make a cache miss an error rather than a request.
//
// Zero dependencies; node:22 runs it as is.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8547)
const ANVIL = process.env.ANVIL_RPC_URL ?? 'http://anvil:8545'
const UPSTREAM = process.env.UPSTREAM_RPC_URL
const OFFLINE = process.env.FORK_RPC_OFFLINE === '1'
if (!UPSTREAM && !OFFLINE)
  throw new Error('UPSTREAM_RPC_URL is required (or FORK_RPC_OFFLINE=1)')
const CACHE_DIR = process.env.CACHE_DIR
if (CACHE_DIR) await mkdir(CACHE_DIR, { recursive: true })

const stats = { hits: 0, misses: 0 }
const cachePath = ({ method, params = [] }) =>
  path.join(
    CACHE_DIR,
    `${createHash('sha256')
      .update(`${method}:${JSON.stringify(params)}`)
      .digest('hex')}.json`,
  )

/** The cached `result` for an upstream request, or undefined. */
async function cached(request) {
  if (!CACHE_DIR) return undefined
  try {
    const result = JSON.parse(await readFile(cachePath(request), 'utf8'))
    stats.hits++
    return result
  } catch {
    return undefined
  }
}

async function store(request, reply) {
  // Only a real answer is worth keeping: an error or a null (a hash upstream
  // does not know) may change.
  if (!CACHE_DIR || reply.error || reply.result == null) return
  const file = cachePath(request)
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(reply.result))
  await rename(tmp, file)
}

/** An upstream request, answered from the cache when it can be. */
async function upstream(request) {
  const hit = await cached(request)
  if (hit !== undefined) return { jsonrpc: '2.0', id: request.id, result: hit }
  stats.misses++
  // A hash Anvil does not know and the cache has never seen is not a
  // pre-fork transaction we need: answer "not found" rather than fail.
  if (
    OFFLINE &&
    (request.method === 'eth_getTransactionReceipt' ||
      request.method === 'eth_getTransactionByHash')
  )
    return { jsonrpc: '2.0', id: request.id, result: null }
  if (OFFLINE)
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `fork-rpc offline: no cached answer for ${request.method}`,
      },
    }
  const reply = await post(UPSTREAM, request)
  await store(request, reply)
  return reply
}

let forkBlock = null

const UPSTREAM_CHUNK = 10
// The public upstream throttles beyond a handful of requests in flight, and a
// throttled request costs more (backoff) than a queued one.
const UPSTREAM_IN_FLIGHT = Number(process.env.UPSTREAM_IN_FLIGHT ?? 6)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let inFlight = 0
const waiting = []
async function withUpstreamSlot(fn) {
  if (inFlight >= UPSTREAM_IN_FLIGHT) await new Promise((r) => waiting.push(r))
  inFlight++
  try {
    return await fn()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

/**
 * POST with retries: the public upstream throttles bursts (429, 5xx, or a
 * non-array reply to a batch), and the runner would otherwise see each of
 * those as a failed window.
 */
async function post(url, body) {
  let lastError
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const send = () =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      const res = await (url === UPSTREAM ? withUpstreamSlot(send) : send())
      if (!res.ok)
        throw new Error(`${new URL(url).host} answered ${res.status}`)
      const reply = await res.json()
      if (Array.isArray(body) && !Array.isArray(reply))
        throw new Error(`batch answered ${JSON.stringify(reply).slice(0, 200)}`)
      return reply
    } catch (error) {
      lastError = error
      await sleep(250 * 2 ** attempt)
    }
  }
  console.error(`[fork-rpc] giving up: ${lastError.message}`)
  throw lastError
}

/**
 * Upstream batches: cached answers first, the rest out in chunks the public
 * endpoint answers quickly.
 */
async function postUpstreamBatch(requests) {
  const hits = await Promise.all(requests.map(cached))
  const answered = []
  const missing = []
  requests.forEach((request, i) => {
    if (hits[i] === undefined) missing.push(request)
    else answered.push({ jsonrpc: '2.0', id: request.id, result: hits[i] })
  })
  if (missing.length === 0) return answered
  stats.misses += missing.length
  if (OFFLINE)
    return [...answered, ...(await Promise.all(missing.map(upstream)))]
  const chunks = []
  for (let i = 0; i < missing.length; i += UPSTREAM_CHUNK)
    chunks.push(missing.slice(i, i + UPSTREAM_CHUNK))
  const replies = (
    await Promise.all(chunks.map((c) => post(UPSTREAM, c)))
  ).flat()
  const byId = new Map(missing.map((r) => [r.id, r]))
  await Promise.all(
    replies.map((reply) => {
      const request = byId.get(reply.id)
      return request ? store(request, reply) : undefined
    }),
  )
  return [...answered, ...replies]
}

async function refreshForkBlock() {
  try {
    const { result } = await post(ANVIL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'anvil_nodeInfo',
      params: [],
    })
    forkBlock = BigInt(result.forkConfig.forkBlockNumber)
  } catch (error) {
    console.error(`[fork-rpc] cannot read the fork block: ${error.message}`)
  }
}

const isNumber = (tag) => typeof tag === 'string' && tag.startsWith('0x')
const atOrBelowFork = (tag) =>
  forkBlock !== null && isNumber(tag) && BigInt(tag) <= forkBlock
const hex = (n) => `0x${n.toString(16)}`

/**
 * Where one request goes. A log range that straddles the fork is split in
 * two; the caller merges the halves.
 */
function route(request) {
  const { method, params = [] } = request
  switch (method) {
    case 'eth_getBlockByNumber':
      return atOrBelowFork(params[0]) ? 'upstream' : 'anvil'
    case 'eth_getLogs': {
      const filter = params[0] ?? {}
      if (filter.blockHash) return 'anvil'
      if (atOrBelowFork(filter.toBlock)) return 'upstream'
      if (atOrBelowFork(filter.fromBlock) && isNumber(filter.toBlock))
        return 'split'
      return 'anvil'
    }
    // Local transactions are Anvil's; only a hash Anvil does not know is
    // looked up upstream (a pre-fork one). Asking upstream first cost a
    // public request per test transaction and drew 429s that stalled bigname.
    case 'eth_getTransactionReceipt':
    case 'eth_getTransactionByHash':
      return 'anvil-then-upstream'
    default:
      return 'anvil'
  }
}

async function call(request) {
  const target = route(request)
  if (target === 'anvil') return post(ANVIL, request)
  if (target === 'upstream') return upstream(request)
  if (target === 'anvil-then-upstream') {
    const reply = await post(ANVIL, request)
    return reply.result ? reply : upstream(request)
  }
  // split
  const filter = request.params[0]
  const [below, above] = await Promise.all([
    upstream({
      ...request,
      params: [{ ...filter, toBlock: hex(forkBlock) }],
    }),
    post(ANVIL, {
      ...request,
      params: [{ ...filter, fromBlock: hex(forkBlock + 1n) }],
    }),
  ])
  const error = below.error ?? above.error
  if (error) return { jsonrpc: '2.0', id: request.id, error }
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: [...below.result, ...above.result],
  }
}

/** A batch keeps its batching per target, so upstream sees one request. */
async function callBatch(requests) {
  const upstream = requests.filter((r) => route(r) === 'upstream')
  const rest = requests.filter((r) => route(r) !== 'upstream')
  const [upstreamReplies, restReplies] = await Promise.all([
    upstream.length ? postUpstreamBatch(upstream) : [],
    Promise.all(rest.map(call)),
  ])
  const byId = new Map(
    [...upstreamReplies, ...restReplies].map((reply) => [reply.id, reply]),
  )
  return requests.map(
    (r) =>
      byId.get(r.id) ?? {
        jsonrpc: '2.0',
        id: r.id,
        error: { code: -32603, message: 'fork-rpc: no reply' },
      },
  )
}

const server = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    if (forkBlock === null) await refreshForkBlock()
    const parsed = JSON.parse(body)
    const reply = Array.isArray(parsed)
      ? await callBatch(parsed)
      : await call(parsed)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply))
  } catch (error) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: `fork-rpc: ${error.message}` },
      }),
    )
  }
})

await refreshForkBlock()
// Anvil may be recreated under us with a new fork block.
setInterval(refreshForkBlock, 30_000)
// One line a minute when the cache did anything: proof of offline readiness.
setInterval(() => {
  if (stats.hits + stats.misses === 0) return
  console.log(`[fork-rpc] cache: ${stats.hits} hits, ${stats.misses} misses`)
  stats.hits = 0
  stats.misses = 0
}, 60_000)
server.listen(PORT, () =>
  console.log(
    `[fork-rpc] :${PORT} fork block ${forkBlock} anvil ${ANVIL}` +
      `${CACHE_DIR ? ` cache ${CACHE_DIR}` : ''}${OFFLINE ? ' OFFLINE' : ''}`,
  ),
)
