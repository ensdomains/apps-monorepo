import { describe, expect, it } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import { createEnsClient } from './client'

describe('createEnsClient environment safety', () => {
  it.each([
    'mainnet',
    'unknown',
    undefined,
  ])('rejects CHAIN %s even with a Sepolia RPC binding', (chain) => {
    const env = {
      CHAIN: chain,
      SEPOLIA_RPC_URL: 'https://rpc.example/sepolia',
    } as CloudflareBindings
    const result = createEnsClient(env)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) expect(result.error.code).toBe('UNSUPPORTED_CHAIN')
  })

  it('preserves the Sepolia chain and configured transport', () => {
    const result = createEnsClient(
      makeMockEnv({ SEPOLIA_RPC_URL: 'https://rpc.example/sepolia' }),
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.chain.id).toBe(11155111)
      expect(result.value.transport.url).toBe('https://rpc.example/sepolia')
    }
  })

  it('rejects a missing Sepolia RPC binding', () => {
    const result = createEnsClient(makeMockEnv())

    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error.code).toBe('MISSING_SEPOLIA_RPC_URL')
  })
})
