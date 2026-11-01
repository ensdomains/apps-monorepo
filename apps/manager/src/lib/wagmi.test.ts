import { toHex } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chain, l2Sources } from '@/config'
import { publicClient, wagmiConfig } from './wagmi'

afterEach(() => vi.unstubAllGlobals())

describe('wagmiConfig', () => {
  it.each(['public client', 'wagmi client'] as const)(
    'batches parallel log requests into one HTTP request on the %s',
    async (kind) => {
      const payloads: unknown[] = []
      const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        payloads.push(body)
        const messages = Array.isArray(body) ? body : [body]
        const responses = messages.map(({ id }: { readonly id: number }) => ({
          jsonrpc: '2.0',
          id,
          result: [],
        }))
        return new Response(
          JSON.stringify(Array.isArray(body) ? responses : responses[0]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      })
      vi.stubGlobal('fetch', fetch)
      const client =
        kind === 'public client'
          ? publicClient
          : wagmiConfig.getClient({ chainId: chain.id })
      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          client.request({
            method: 'eth_getLogs',
            params: [{ fromBlock: toHex(index), toBlock: toHex(index) }],
          }),
        ),
      )
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(payloads).toEqual([
        Array.from({ length: 8 }, (_, index) =>
          expect.objectContaining({
            method: 'eth_getLogs',
            params: [{ fromBlock: toHex(index), toBlock: toHex(index) }],
          }),
        ),
      ])
    },
  )

  // The first chain is wagmi's default and where connect sends a wallet on an
  // unsupported chain; an L2 there would take every unpinned read with it.
  it('puts the app chain first, then each L2 source', () => {
    expect(wagmiConfig.chains.map(({ id }) => id)).toEqual([
      chain.id,
      ...l2Sources.map((source) => source.chain.id),
    ])
  })

  it('reads each L2 source on its own chain', () => {
    for (const source of l2Sources) {
      expect(source.client.chain?.id).toBe(source.chain.id)
    }
  })
})
