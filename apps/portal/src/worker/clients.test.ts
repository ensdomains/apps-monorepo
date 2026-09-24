import { encodeErrorResult, offchainLookupAbiItem } from 'viem/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClient } from './clients'

const RESOLVER = '0x2222222222222222222222222222222222222222'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createClient', () => {
  it('does not follow an OffchainLookup revert to its gateway', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        jsonrpc: '2.0',
        id: JSON.parse(String(init?.body)).id,
        error: {
          code: 3,
          message: 'execution reverted',
          data: encodeErrorResult({
            abi: [offchainLookupAbiItem],
            errorName: 'OffchainLookup',
            args: [
              RESOLVER,
              ['https://attacker.test/{sender}/{data}'],
              '0x',
              '0x12345678',
              '0x',
            ],
          }),
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createClient({ SEPOLIA_RPC_URL: 'https://rpc.test/' } as Env)

    await expect(client.call({ to: RESOLVER, data: '0x' })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('attacker.test'),
      expect.anything(),
    )
  })
})
