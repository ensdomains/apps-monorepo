import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const hash = n => `0x${n.toString(16).padStart(64, '0')}`
async function serve(answer) {
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body)
    const one = value => ({ jsonrpc: '2.0', id: value.id, result: answer(value) })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(Array.isArray(input) ? input.map(one) : one(input)))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

test('bounded routing hints preserve historical receipts and local chain routing', { timeout: 15000 }, async t => {
  const cache = await mkdtemp(path.join(os.tmpdir(), 'fork-rpc-test-'))
  let localReceiptReads = 0
  const local = await serve(request => {
    if (request.method === 'anvil_nodeInfo') return { forkConfig: { forkBlockNumber: 100 } }
    if (request.method === 'eth_getTransactionReceipt') {
      localReceiptReads++
      return request.params[0] === hash(99) ? { transactionHash: hash(99), blockNumber: '0x65' } : null
    }
    return null
  })
  const upstream = await serve(request => {
    if (request.method === 'eth_getBlockByNumber') return { number: request.params[0], transactions: [hash(1), hash(2), hash(3)] }
    if (request.method === 'eth_getTransactionReceipt') return { transactionHash: request.params[0], blockNumber: '0x63' }
    return null
  })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fork-rpc.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', ANVIL_RPC_URL: local.url, UPSTREAM_RPC_URL: upstream.url, CACHE_DIR: cache, HISTORICAL_HINT_LIMIT: '2', UPSTREAM_MIN_INTERVAL_MS: '0', FORK_RPC_OFFLINE: '0', CACHE_READ_ONLY: '0' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    child.kill('SIGTERM')
    for (const { server } of [local, upstream]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await rm(cache, { recursive: true, force: true })
  })
  for (let n = 0; n < 100 && !output.match(/\[fork-rpc\] :(\d+) fork block/); n++) await new Promise(resolve => setTimeout(resolve, 50))
  const port = output.match(/\[fork-rpc\] :(\d+) fork block/)?.[1]
  assert.ok(port, output)
  const rpc = async (method, params, id = 1) => (await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json()
  await rpc('eth_getBlockByNumber', ['0x63', false])
  const first = await rpc('eth_getTransactionReceipt', [hash(1)])
  assert.equal(localReceiptReads, 0, 'an evicted exact hint still verifies the real historical receipt without making Anvil fetch a remote block')
  assert.equal(first.result.blockNumber, '0x63')
  const cached = await rpc('eth_getTransactionReceipt', [hash(1)], 44)
  assert.equal(cached.id, 44)
  assert.deepEqual(cached.result, first.result)
  assert.equal(localReceiptReads, 0, 'disk history survives hint eviction')
  const current = await rpc('eth_getTransactionReceipt', [hash(99)])
  assert.equal(current.result.blockNumber, '0x65')
  assert.equal(localReceiptReads, 1, 'uncached local transaction is still read from the local chain')
})

test('probabilistic historical hints never replace a local receipt with a post-fork upstream receipt', { timeout: 15000 }, async t => {
  let remoteReceiptReads = 0
  const local = await serve(request => {
    if (request.method === 'anvil_nodeInfo') return { forkConfig: { forkBlockNumber: 100 } }
    if (request.method === 'eth_getTransactionReceipt') return { transactionHash: request.params[0], blockNumber: '0x65', source: 'local' }
    return null
  })
  const upstream = await serve(request => {
    if (request.method === 'eth_getBlockByNumber') return { number: '0x63', transactions: Array.from({ length: 50 }, (_, i) => hash(i + 1)) }
    if (request.method === 'eth_getTransactionReceipt') { remoteReceiptReads++; return { transactionHash: request.params[0], blockNumber: '0x66', source: 'upstream' } }
    return null
  })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fork-rpc.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', ANVIL_RPC_URL: local.url, UPSTREAM_RPC_URL: upstream.url, HISTORICAL_HINT_LIMIT: '1', HISTORICAL_BLOOM_BYTES: '1', UPSTREAM_MIN_INTERVAL_MS: '0', FORK_RPC_OFFLINE: '0', CACHE_DIR: '' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    child.kill('SIGTERM')
    for (const { server } of [local, upstream]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  })
  for (let n = 0; n < 100 && !output.match(/\[fork-rpc\] :(\d+) fork block/); n++) await new Promise(resolve => setTimeout(resolve, 50))
  const port = output.match(/\[fork-rpc\] :(\d+) fork block/)?.[1]
  assert.ok(port, output)
  const rpc = async (method, params, id = 1) => (await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json()
  await rpc('eth_getBlockByNumber', ['0x63', false])
  const receipt = await rpc('eth_getTransactionReceipt', [hash(99)], 77)
  assert.equal(remoteReceiptReads, 1, 'the tiny saturated hint deliberately produces a false positive')
  assert.equal(receipt.id, 77)
  assert.equal(receipt.result.source, 'local')
  assert.equal(receipt.result.blockNumber, '0x65')
})


test('resumed indexer verifies unknown historical transactions without sending them through Anvil', { timeout: 15000 }, async t => {
  let localReads = 0
  const local = await serve(request => {
    if (request.method === 'anvil_nodeInfo') return { forkConfig: { forkBlockNumber: 100 } }
    localReads++
    return { transactionHash: request.params[0], blockNumber: '0x65', source: 'local' }
  })
  const upstream = await serve(request => request.params[0] === hash(1)
    ? { transactionHash: hash(1), blockNumber: '0x63', source: 'upstream' }
    : request.params[0] === hash(2) ? { transactionHash: hash(2), blockNumber: '0x66', source: 'upstream' } : null)
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fork-rpc.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', ANVIL_RPC_URL: local.url, UPSTREAM_RPC_URL: upstream.url, UPSTREAM_MIN_INTERVAL_MS: '0', FORK_RPC_OFFLINE: '0', FORK_RPC_VERIFY_UNKNOWN_TX: '1', CACHE_DIR: '' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    child.kill('SIGTERM')
    for (const { server } of [local, upstream]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  })
  for (let n = 0; n < 100 && !output.match(/\[fork-rpc\] :(\d+) fork block/); n++) await new Promise(resolve => setTimeout(resolve, 50))
  const port = output.match(/\[fork-rpc\] :(\d+) fork block/)?.[1]; assert.ok(port, output)
  const rpc = async n => (await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: n, method: 'eth_getTransactionReceipt', params: [hash(n)] }) })).json()
  assert.equal((await rpc(1)).result.source, 'upstream'); assert.equal(localReads, 0)
  assert.equal((await rpc(2)).result.source, 'local', 'post-fork public receipt is not the local transaction')
  assert.equal((await rpc(3)).result.source, 'local', 'upstream absence does not erase a local transaction')
  assert.equal(localReads, 2)
})

test('shared history cache survives a parked chain and rejects writes and moving/local ranges', { timeout: 15000 }, async t => {
  const requests = []
  const upstream = await serve(request => {
    requests.push(request)
    if (request.method === 'eth_getTransactionReceipt') return request.params[0] === hash(1) ? { transactionHash: hash(1), blockNumber: '0x63' } : null
    return { number: '0x63', transactions: [] }
  })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fork-rpc.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', ANVIL_RPC_URL: 'http://127.0.0.1:1', UPSTREAM_RPC_URL: upstream.url, UPSTREAM_MIN_INTERVAL_MS: '0', FORK_RPC_OFFLINE: '0', FORK_RPC_HISTORY_CACHE: '1', FORK_RPC_FIXED_FORK_BLOCK: '100', CACHE_DIR: '' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
  t.after(async () => { child.kill('SIGTERM'); upstream.server.closeAllConnections(); await new Promise(resolve => upstream.server.close(resolve)) })
  for (let n = 0; n < 100 && !output.match(/\[fork-rpc\] :(\d+) fork block/); n++) await new Promise(resolve => setTimeout(resolve, 50))
  const port = output.match(/\[fork-rpc\] :(\d+) fork block/)?.[1]; assert.ok(port, output)
  const rpc = async (method, params) => (await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }) })).json()
  assert.equal((await rpc('eth_getTransactionReceipt', [hash(1)])).result.blockNumber, '0x63')
  assert.equal((await rpc('eth_getTransactionReceipt', [hash(2)])).result, null, 'return actual upstream absence without consulting an unrelated local chain')
  assert.equal((await rpc('eth_getBlockByNumber', ['0x63', false])).result.number, '0x63')
  for (const [method, params] of [['eth_sendRawTransaction', ['0xdead']], ['eth_getBlockByNumber', ['latest', false]], ['eth_getLogs', [{ fromBlock: '0x64', toBlock: '0x65' }]]]) {
    assert.equal((await rpc(method, params)).error.code, -32601)
  }
  assert.deepEqual(requests.map(request => request.method), ['eth_getTransactionReceipt', 'eth_getTransactionReceipt', 'eth_getBlockByNumber'])
})
