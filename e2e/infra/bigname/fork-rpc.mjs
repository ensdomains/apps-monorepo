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
// A resumed indexer may already have persisted headers and therefore request
// their transactions without replaying the headers that populate our hints.
const VERIFY_UNKNOWN_TX = process.env.FORK_RPC_VERIFY_UNKNOWN_TX === '1'
// Shared immutable history must remain usable after its original test chain
// is parked. It must never consult that unrelated chain for another fork's
// transaction, and it must never forward writes to the public network.
const HISTORY_CACHE = process.env.FORK_RPC_HISTORY_CACHE === '1'
const FIXED_FORK_BLOCK = process.env.FORK_RPC_FIXED_FORK_BLOCK
if (HISTORY_CACHE && !FIXED_FORK_BLOCK)
  throw new Error('History cache requires an explicit verified fork block')
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
  if (
    !CACHE_DIR ||
    process.env.CACHE_READ_ONLY === '1' ||
    reply.error ||
    reply.result == null
  )
    return
  const file = cachePath(request)
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(reply.result))
  await rename(tmp, file)
}

const inFlightUpstream = new Map()

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
  const key = JSON.stringify([request.method, request.params ?? []])
  if (!inFlightUpstream.has(key)) {
    const pending = (async () => {
      const reply = await post(UPSTREAM, request)
      await store(request, reply)
      return reply
    })().finally(() => inFlightUpstream.delete(key))
    inFlightUpstream.set(key, pending)
  }
  const reply = await inFlightUpstream.get(key)
  return { ...reply, id: request.id }
}

let forkBlock = FIXED_FORK_BLOCK ? BigInt(FIXED_FORK_BLOCK) : null
// Remember transactions proven historical by upstream logs or headers. Asking
// Anvil for these receipts can make it fetch every transaction in that block.
const historicalTransactions = new Set()
const HISTORICAL_HINT_LIMIT = Number(process.env.HISTORICAL_HINT_LIMIT ?? 50000)
// Fixed-size membership hints preserve old header/log identities after the
// exact LRU set evicts them. A possible match is never itself an RPC answer:
// upstream must return an actual receipt/transaction at or below the fork.
// This avoids sending historical hashes back through Anvil, which can fetch
// every transaction in a remote block and stall local mining.
const historicalBloom = Buffer.alloc(
  Number(process.env.HISTORICAL_BLOOM_BYTES ?? 32 * 1024 * 1024),
)
function historicalBits(hash) {
  const digest = createHash('sha256').update(hash).digest()
  return [0, 4, 8, 12].map(
    (offset) => digest.readUInt32LE(offset) % (historicalBloom.length * 8),
  )
}
function maybeHistorical(hash) {
  return (
    typeof hash === 'string' &&
    historicalBits(hash).every(
      (bit) => (historicalBloom[bit >>> 3] & (1 << (bit & 7))) !== 0,
    )
  )
}
function rememberHistoricalHash(hash) {
  if (!hash) return
  historicalTransactions.add(hash)
  for (const bit of historicalBits(hash))
    historicalBloom[bit >>> 3] |= 1 << (bit & 7)
  // Routing hints only. Immutable RPC answers remain on disk; evicted hashes
  // still fall back to actual Anvil/upstream lookups and are never fabricated.
  while (historicalTransactions.size > HISTORICAL_HINT_LIMIT)
    historicalTransactions.delete(historicalTransactions.values().next().value)
}
function rememberHistorical(request, result) {
  if (request.method === 'eth_getLogs' && Array.isArray(result)) {
    for (const log of result) {
      if (atOrBelowFork(log.blockNumber) && log.transactionHash)
        rememberHistoricalHash(log.transactionHash)
    }
  }
  if (
    request.method !== 'eth_getBlockByNumber' ||
    !atOrBelowFork(result?.number)
  )
    return
  for (const transaction of result.transactions ?? [])
    rememberHistoricalHash(
      typeof transaction === 'string' ? transaction : transaction.hash,
    )
}

const UPSTREAM_CHUNK = Number(process.env.UPSTREAM_CHUNK ?? 5)
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
    const result = await fn()
    await sleep(Number(process.env.UPSTREAM_MIN_INTERVAL_MS ?? 500))
    return result
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
  // Publicnode accepts at most ten addresses in one log filter. Preserve the
  // complete query by partitioning addresses, then merging canonical logs.
  const oversizedLogs = (request) =>
    request?.method === 'eth_getLogs' &&
    Array.isArray(request.params?.[0]?.address) &&
    request.params[0].address.length > 10
  if (url === UPSTREAM && Array.isArray(body) && body.some(oversizedLogs))
    return Promise.all(body.map((request) => post(url, request)))
  if (url === UPSTREAM && oversizedLogs(body)) {
    const filter = body.params[0]
    const parts = []
    for (let i = 0; i < filter.address.length; i += 10)
      parts.push({
        ...body,
        params: [{ ...filter, address: filter.address.slice(i, i + 10) }],
      })
    const replies = await Promise.all(parts.map((part) => post(url, part)))
    const failed = replies.find((reply) => reply.error)
    if (failed) return { ...failed, id: body.id }
    const unique = new Map(
      replies
        .flatMap((reply) => reply.result)
        .map((log) => [`${log.blockHash}:${log.logIndex}`, log]),
    )
    const result = [...unique.values()].sort((a, b) => {
      const block = BigInt(a.blockNumber) - BigInt(b.blockNumber)
      return block
        ? Number(block)
        : Number(BigInt(a.logIndex) - BigInt(b.logIndex))
    })
    return { jsonrpc: '2.0', id: body.id, result }
  }
  let lastError
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const send = () =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        })
      const res = await (url === UPSTREAM ? withUpstreamSlot(send) : send())
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        if (attempt === 0)
          console.warn(
            `[fork-rpc] ${new URL(url).host}: ${res.status} ${detail}`,
          )
        throw new Error(
          `${new URL(url).host} answered ${res.status}: ${detail}`,
        )
      }
      const reply = await res.json()
      if (reply?.error && body?.method === 'eth_getLogs' && CACHE_DIR)
        await writeFile(
          path.join(CACHE_DIR, 'last-log-error.json'),
          JSON.stringify({ request: body, error: reply.error }),
        )
      if (Array.isArray(body) && !Array.isArray(reply))
        throw new Error(`batch answered ${JSON.stringify(reply).slice(0, 200)}`)
      return reply
    } catch (error) {
      lastError = error
      await sleep(Math.min(15000, 1000 * 2 ** attempt))
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
  // Several isolated indexers backfill the same immutable fork history.
  // Share in-flight answers across batches as well as individual requests;
  // request IDs belong to the caller and must not be shared with the answer.
  const fresh = []
  const pending = missing.map((request) => {
    const key = JSON.stringify([request.method, request.params ?? []])
    if (!inFlightUpstream.has(key)) {
      let fulfill, reject
      const promise = new Promise((yes, no) => {
        fulfill = yes
        reject = no
      })
      inFlightUpstream.set(key, promise)
      fresh.push({ request, key, fulfill, reject })
    }
    return inFlightUpstream
      .get(key)
      .then((reply) => ({ ...reply, id: request.id }))
  })
  const answers = Promise.all(pending)
  const chunks = []
  for (let i = 0; i < fresh.length; i += UPSTREAM_CHUNK)
    chunks.push(fresh.slice(i, i + UPSTREAM_CHUNK))
  const work = Promise.all(
    chunks.map(async (chunk) => {
      try {
        const replies = await post(
          UPSTREAM,
          chunk.map((entry) => entry.request),
        )
        const byId = new Map(replies.map((reply) => [reply.id, reply]))
        await Promise.all(
          chunk.map(async (entry) => {
            const reply = byId.get(entry.request.id) ?? {
              jsonrpc: '2.0',
              id: entry.request.id,
              error: {
                code: -32603,
                message: 'fork-rpc: upstream omitted a batch reply',
              },
            }
            await store(entry.request, reply)
            entry.fulfill(reply)
          }),
        )
      } catch (error) {
        for (const entry of chunk) entry.reject(error)
      } finally {
        for (const entry of chunk) inFlightUpstream.delete(entry.key)
      }
    }),
  )
  const [replies] = await Promise.all([answers, work])
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
    const nextForkBlock = BigInt(result.forkConfig.forkBlockNumber)
    if (forkBlock !== nextForkBlock) {
      historicalTransactions.clear()
      historicalBloom.fill(0)
    }
    forkBlock = nextForkBlock
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
  if (HISTORY_CACHE) {
    if (
      ['eth_getTransactionReceipt', 'eth_getTransactionByHash'].includes(method)
    )
      return 'upstream'
    if (method === 'eth_getBlockByNumber' && atOrBelowFork(params[0]))
      return 'upstream'
    if (
      method === 'eth_getLogs' &&
      !params[0]?.blockHash &&
      atOrBelowFork(params[0]?.fromBlock) &&
      atOrBelowFork(params[0]?.toBlock)
    )
      return 'upstream'
    return 'reject-history'
  }
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
      return historicalTransactions.has(params[0])
        ? 'upstream'
        : maybeHistorical(params[0]) || VERIFY_UNKNOWN_TX
          ? 'verify-historical'
          : 'anvil-then-upstream'
    default:
      return 'anvil'
  }
}

async function call(request) {
  const target = route(request)
  if (target === 'reject-history')
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message:
          'Shared history cache accepts only immutable history reads; use the fixture RPC for local or moving state.',
      },
    }
  if (target === 'anvil') return post(ANVIL, request)
  if (target === 'upstream') return upstream(request)
  if (target === 'verify-historical') {
    const reply = await upstream(request)
    if (reply.result && atOrBelowFork(reply.result.blockNumber)) return reply
    // False positives and hashes not available upstream still use the actual
    // local chain. Never turn a membership hint into a missing-local-tx answer.
    return post(ANVIL, request)
  }
  if (target === 'anvil-then-upstream') {
    // A previously verified pre-fork receipt/transaction does not need an
    // Anvil round trip after its routing hint ages out of the bounded set.
    const hit = await cached(request)
    if (hit !== undefined && atOrBelowFork(hit?.blockNumber))
      return { jsonrpc: '2.0', id: request.id, result: hit }
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
    if (Array.isArray(parsed)) {
      const requestsById = new Map(
        parsed.map((request) => [request.id, request]),
      )
      for (const item of reply) {
        const request = requestsById.get(item.id)
        if (request) rememberHistorical(request, item.result)
      }
    } else rememberHistorical(parsed, reply.result)
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

if (!FIXED_FORK_BLOCK) await refreshForkBlock()
// Anvil may be recreated under us with a new fork block.
if (!FIXED_FORK_BLOCK) setInterval(refreshForkBlock, 30_000)
// One line a minute when the cache did anything: proof of offline readiness.
setInterval(() => {
  if (stats.hits + stats.misses === 0) return
  console.log(
    `[fork-rpc] cache: ${stats.hits} hits, ${stats.misses} misses; ${historicalTransactions.size} bounded routing hints`,
  )
  stats.hits = 0
  stats.misses = 0
}, 60_000)
server.listen(PORT, () =>
  console.log(
    `[fork-rpc] :${server.address().port} fork block ${forkBlock} anvil ${ANVIL}` +
      `${CACHE_DIR ? ` cache ${CACHE_DIR}` : ''}${OFFLINE ? ' OFFLINE' : ''}`,
  ),
)
