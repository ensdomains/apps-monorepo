import { describe, expect, it } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import { createEnsClient } from './client'

describe('createEnsClient environment safety', () => {
  it.each(['unknown', undefined])(
    'rejects CHAIN %s even with both RPC bindings',
    (chain) => {
      const env = {
        CHAIN: chain,
        MAINNET_RPC_URL: 'https://rpc.example/mainnet',
        SEPOLIA_RPC_URL: 'https://rpc.example/sepolia',
      } as CloudflareBindings
      const result = createEnsClient(env)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) expect(result.error.code).toBe('UNSUPPORTED_CHAIN')
    },
  )

  it.each([
    ['mainnet', 1, 'MAINNET_RPC_URL'],
    ['sepolia', 11155111, 'SEPOLIA_RPC_URL'],
  ] as const)(
    'uses only the %s chain and RPC binding',
    (chain, chainId, binding) => {
      const env = new Proxy(
        makeMockEnv({
          CHAIN: chain,
          [binding]: `https://rpc.example/${chain}`,
        }),
        {
          get(target, property, receiver) {
            if (
              property === 'MAINNET_RPC_URL' ||
              property === 'SEPOLIA_RPC_URL'
            ) {
              if (property !== binding)
                throw new Error('Read other network RPC')
            }
            return Reflect.get(target, property, receiver)
          },
        },
      )
      const result = createEnsClient(env)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.chain.id).toBe(chainId)
        expect(result.value.transport.url).toBe(`https://rpc.example/${chain}`)
      }
    },
  )

  it.each(['mainnet', 'sepolia'] as const)(
    'fails closed on %s when its RPC is missing or blank, even with the other RPC',
    (chain) => {
      const binding =
        chain === 'mainnet' ? 'MAINNET_RPC_URL' : 'SEPOLIA_RPC_URL'
      for (const rpcUrl of [undefined, '', '   ']) {
        const result = createEnsClient(
          makeMockEnv({
            CHAIN: chain,
            MAINNET_RPC_URL: 'https://rpc.example/mainnet',
            SEPOLIA_RPC_URL: 'https://rpc.example/sepolia',
            [binding]: rpcUrl,
          }),
        )

        expect(result.isErr()).toBe(true)
        if (result.isErr()) expect(result.error.code).toBe(`MISSING_${binding}`)
      }
    },
  )

  it.each(['mainnet', 'sepolia'] as const)(
    'rejects malformed or non-HTTP RPC URLs on %s',
    (chain) => {
      const binding =
        chain === 'mainnet' ? 'MAINNET_RPC_URL' : 'SEPOLIA_RPC_URL'
      for (const rpcUrl of ['not a URL', '/rpc', 'ftp://rpc.example']) {
        const result = createEnsClient(
          makeMockEnv({ CHAIN: chain, [binding]: rpcUrl }),
        )

        expect(result.isErr()).toBe(true)
        if (result.isErr()) expect(result.error.code).toBe('INVALID_RPC_URL')
      }
    },
  )
})
