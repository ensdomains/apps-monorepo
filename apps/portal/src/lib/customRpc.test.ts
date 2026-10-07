// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { checkRpcEndpoint, getCustomRpcUrl, validateRpcUrl } from './customRpc'

describe('validateRpcUrl', () => {
  it.each([
    ['https://rpc.example.com', true],
    ['  https://rpc.example.com/key  ', true],
    ['wss://rpc.example.com', true],
    ['http://localhost:8545', true],
    ['ws://127.0.0.1:8546', true],
    ['', false],
    ['   ', false],
    ['not a url', false],
    ['ftp://rpc.example.com', false],
    ['javascript:alert(1)', false],
    ['https://user:pass@rpc.example.com', false],
  ])('%j -> ok=%s', (input, ok) => {
    expect(validateRpcUrl(input).isOk()).toBe(ok)
  })
})

describe('getCustomRpcUrl', () => {
  afterEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(getCustomRpcUrl()).toBeNull()
  })

  it('returns a valid stored url', () => {
    localStorage.setItem('custom-rpc-url', JSON.stringify('https://a.io/'))
    expect(getCustomRpcUrl()).toBe('https://a.io/')
  })

  it.each([
    '{broken',
    JSON.stringify('ftp://a.io'),
    JSON.stringify(5),
  ])('ignores corrupted value %s', (value) => {
    localStorage.setItem('custom-rpc-url', value)
    expect(getCustomRpcUrl()).toBeNull()
  })
})

describe('checkRpcEndpoint', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubChainId = (result: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ result }) }),
    )

  it('accepts a matching chain id', async () => {
    stubChainId(`0x${envConfig.chain.id.toString(16)}`)
    expect((await checkRpcEndpoint('https://a.io')).isOk()).toBe(true)
  })

  it('accepts an uppercase matching chain id', async () => {
    stubChainId(`0x${envConfig.chain.id.toString(16).toUpperCase()}`)
    expect((await checkRpcEndpoint('https://a.io')).isOk()).toBe(true)
  })

  it('rejects a different chain', async () => {
    stubChainId('0x1')
    const res = await checkRpcEndpoint('https://a.io')
    expect(res._unsafeUnwrapErr().reason).toBe('wrong-chain')
  })

  it('rejects an unreachable endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const res = await checkRpcEndpoint('https://a.io')
    expect(res._unsafeUnwrapErr().reason).toBe('unreachable')
  })

  it('rejects a non-RPC response', async () => {
    stubChainId(undefined)
    const res = await checkRpcEndpoint('https://a.io')
    expect(res._unsafeUnwrapErr().reason).toBe('unreachable')
  })

  it('rejects a websocket message that is not JSON instead of hanging', async () => {
    vi.stubGlobal(
      'WebSocket',
      class {
        onopen: (() => void) | null = null
        onmessage: ((event: { data: unknown }) => void) | null = null
        onerror: (() => void) | null = null
        close = vi.fn()
        send = vi.fn(() => {
          setTimeout(() => this.onmessage?.({ data: '<html>nope</html>' }), 0)
        })
        constructor() {
          setTimeout(() => this.onopen?.(), 0)
        }
      },
    )
    const res = await checkRpcEndpoint('wss://a.io')
    expect(res._unsafeUnwrapErr().reason).toBe('unreachable')
  })
})
