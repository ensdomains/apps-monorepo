import { describe, expect, it } from 'vitest'
import app from './index'

describe('GET /health', () => {
  it.each([
    'mainnet',
    'sepolia',
  ])('reports %s without infrastructure access', async (chain) => {
    const env = new Proxy(
      { CHAIN: chain },
      {
        get(target, key) {
          if (key === 'CHAIN') return target.CHAIN
          throw new Error(`Unexpected binding access: ${String(key)}`)
        },
      },
    ) as CloudflareBindings

    const response = await app.request('/health', undefined, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', chain })
  })
})
