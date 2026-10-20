import { describe, expect, it } from 'vitest'
import { getConfig } from './config'

describe('getConfig network isolation', () => {
  it('resolves mainnet without reading the Sepolia RPC binding', () => {
    const env = new Proxy(
      { CHAIN: 'mainnet' },
      {
        get(target, property) {
          if (property === 'CHAIN') return target.CHAIN
          throw new Error(`Unexpected binding access: ${String(property)}`)
        },
      },
    ) as unknown as CloudflareBindings

    expect(getConfig(env).endpoints.bignameApi).toBe('https://api.bigname.sh')
  })
})
