import { buildConfig } from '@ens-apps/config'
import { encodeFunctionData, parseAbi, toHex } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'

// Keep database setup out of these RPC-boundary tests. Registered names return
// before database queries or analytics, while still exercising real ENS reads.
vi.mock('#core/database/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#core/database/index.js')>()),
  getDatabase: () => ({}),
}))

import namesApp from './index'

afterEach(() => vi.unstubAllGlobals())

describe('name stats network boundary', () => {
  it.each([
    'mainnet',
    'sepolia',
  ] as const)('checks availability on the configured %s RPC and registrar', async (network) => {
    const rpcUrl = `https://rpc.example/${network}`
    const rpc = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      expect(request.url).toBe(rpcUrl)
      const body = (await request.json()) as {
        id: number
        method: string
        params: [{ to: string; data: string }, string]
      }
      expect(body.method).toBe('eth_call')
      expect(body.params[0]).toEqual({
        to: buildConfig({
          network,
        }).chain.contracts.ensEthRegistrar.address,
        data: encodeFunctionData({
          abi: parseAbi(['function isAvailable(string) view returns (bool)']),
          functionName: 'isAvailable',
          args: ['vitalik'],
        }),
      })
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: toHex(false, { size: 32 }),
      })
    })
    vi.stubGlobal('fetch', rpc)
    const env = makeMockEnv({
      CHAIN: network,
      MAINNET_RPC_URL: 'https://rpc.example/mainnet',
      SEPOLIA_RPC_URL: 'https://rpc.example/sepolia',
    })

    const response = await namesApp.request('/names/vitalik.eth/stats', {}, env)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Name stats are only available for unregistered names',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each([
    'mainnet',
    'sepolia',
    'unknown',
    undefined,
  ])('returns server unavailable without making an RPC request for unconfigured CHAIN %s', async (network) => {
    const rpc = vi.fn()
    vi.stubGlobal('fetch', rpc)
    const env = { CHAIN: network } as CloudflareBindings

    const response = await namesApp.request('/names/vitalik.eth/stats', {}, env)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'SERVER_NOT_AVAILABLE' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
