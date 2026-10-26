import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  )
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('immutable requests coalesce, state reads bypass history backlog fairly, and moving reads remain independent', async () => {
  const order = []
  let releaseFirst
  const holdFirst = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const upstream = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const q = JSON.parse(body)
    order.push(q)
    if (q.params[0] === 'first') await holdFirst
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: q.id,
        result: `actual-${q.params[0]}`,
      }),
    )
  })
  const upstreamPort = await listen(upstream)
  const reserve = http.createServer()
  const port = await listen(reserve)
  await new Promise((resolve) => reserve.close(resolve))
  const cache = await mkdtemp(path.join(tmpdir(), 'matrix-upstream-test-'))
  const child = spawn(
    process.execPath,
    [new URL('./upstream-cache.mjs', import.meta.url).pathname],
    {
      env: {
        ...process.env,
        PORT: String(port),
        UPSTREAM_RPC_URL: `http://127.0.0.1:${upstreamPort}`,
        CACHE_DIR: cache,
        UPSTREAM_MIN_INTERVAL_MS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const request = async (method, params, id) =>
    (
      await fetch(`http://127.0.0.1:${port}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      })
    ).json()
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve)
      child.once('error', reject)
    })
    const first = request('eth_getTransactionByHash', ['first'], 1)
    for (let i = 0; i < 100 && !order.length; i++) await sleep(5)
    assert.equal(order.length, 1)
    const historical = Array.from({ length: 8 }, (_, i) =>
      request('eth_getTransactionByHash', [`history-${i}`], 10 + i),
    )
    const states = Array.from({ length: 6 }, (_, i) =>
      request('eth_getStorageAt', [`state-${i}`, '0x0', '0x123'], 30 + i),
    )
    await sleep(100)
    releaseFirst()
    const answers = await Promise.all([first, ...historical, ...states])
    assert.deepEqual(
      order.slice(1, 5).map((q) => q.method),
      Array(4).fill('eth_getStorageAt'),
    )
    assert.equal(order[5].method, 'eth_getTransactionByHash')
    assert.equal(answers[9].result, 'actual-state-0')
    assert.equal(answers[9].id, 30)
    const before = order.length
    const duplicate = await Promise.all(
      [50, 51, 52].map((id) => request('eth_getCode', ['same', '0x123'], id)),
    )
    assert.equal(order.length, before + 1)
    assert.deepEqual(
      duplicate.map((r) => r.id),
      [50, 51, 52],
    )
    assert.ok(duplicate.every((r) => r.result === 'actual-same'))
    await request('eth_getCode', ['same', '0x123'], 53)
    assert.equal(order.length, before + 1)
    await Promise.all(
      [60, 61].map((id) => request('eth_getBalance', ['moving', 'latest'], id)),
    )
    assert.equal(order.length, before + 3)
  } finally {
    releaseFirst()
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
    await new Promise((resolve) => upstream.close(resolve))
    await rm(cache, { recursive: true, force: true })
  }
})
