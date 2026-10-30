import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { test } from 'node:test'

// Exercise the actual router with two distinct RPC backends: a historical
// receipt must bypass Anvil, but a newly mined receipt must never go upstream.
test('routes proven historical transactions upstream and local transactions to Anvil', async (t) => {
  const calls = []
  const serve = async (source) => {
    const server = http.createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      const handle = ({ id, method, params }) => {
        calls.push({ source, method, params })
        let result = { source }
        if (method === 'anvil_nodeInfo')
          result = { forkConfig: { forkBlockNumber: 100 } }
        if (method === 'eth_getLogs')
          result = [{ blockNumber: '0x32', transactionHash: '0xhistorical' }]
        if (method === 'eth_getBlockByNumber')
          result = { number: '0x32', transactions: ['0xheader'] }
        return { jsonrpc: '2.0', id, result }
      }
      const parsed = JSON.parse(body)
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify(
          Array.isArray(parsed) ? parsed.map(handle) : handle(parsed),
        ),
      )
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => {
      server.closeAllConnections()
      server.close()
    })
    return `http://127.0.0.1:${server.address().port}`
  }
  const anvil = await serve('anvil')
  const upstream = await serve('upstream')
  const router = spawn(
    process.execPath,
    [new URL('./fork-rpc.mjs', import.meta.url).pathname],
    {
      env: {
        ...process.env,
        PORT: '0',
        ANVIL_RPC_URL: anvil,
        UPSTREAM_RPC_URL: upstream,
        CACHE_DIR: '',
        FORK_RPC_OFFLINE: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  t.after(() => router.kill())
  let output = ''
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Router did not start')),
      5000,
    )
    router.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/\[fork-rpc\] :(\d+) fork/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
  })
  const rpc = async (method, params) => {
    const reply = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    return (await reply.json()).result
  }
  await rpc('eth_getLogs', [{ fromBlock: '0x30', toBlock: '0x32' }])
  assert.equal(
    (await rpc('eth_getTransactionReceipt', ['0xhistorical'])).source,
    'upstream',
  )
  await rpc('eth_getBlockByNumber', ['0x32', false])
  assert.equal(
    (await rpc('eth_getTransactionByHash', ['0xheader'])).source,
    'upstream',
  )
  assert.equal(
    (await rpc('eth_getTransactionReceipt', ['0xlocal'])).source,
    'anvil',
  )
  assert.equal(
    calls.some(
      (call) => call.source === 'anvil' && call.params?.[0] === '0xhistorical',
    ),
    false,
  )
  assert.equal(
    calls.some(
      (call) => call.source === 'upstream' && call.params?.[0] === '0xlocal',
    ),
    false,
  )
})
