// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { getCustomRpcCandidate, getCustomRpcUrl } from '@/lib/customRpc'
import {
  applyCustomRpc,
  confirmCustomRpcCandidate,
} from './RpcSettingsDialog.handlers'

const reload = vi.fn()
const ACTIVE = 'https://rpc.example.com/key'
const NEXT = 'https://next.example.com/key'

const stubChainId = (chainId: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ result: chainId }) }),
  )
const ownChainId = `0x${envConfig.chain.id.toString(16)}`

beforeEach(() => {
  vi.spyOn(window.location, 'reload').mockImplementation(reload)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  reload.mockClear()
  localStorage.clear()
  for (const name of ['origin', 'candidate'])
    await cookieStore.delete({ name: `__Host-custom-rpc-${name}`, path: '/' })
})

describe('custom RPC save flow', () => {
  it('stores a new URL as the candidate without probing it', async () => {
    // The page can't reach the new origin until a reload allows it.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect((await applyCustomRpc(` ${ACTIVE} `)).isOk()).toBe(true)

    expect(getCustomRpcCandidate()).toBe(ACTIVE)
    expect(getCustomRpcUrl()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('promotes a candidate that answers on the right chain', async () => {
    await applyCustomRpc(ACTIVE)
    stubChainId(ownChainId)

    expect((await confirmCustomRpcCandidate(ACTIVE)).isOk()).toBe(true)

    expect(getCustomRpcUrl()).toBe(ACTIVE)
    expect(getCustomRpcCandidate()).toBeNull()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('drops a failing candidate and keeps the active RPC', async () => {
    stubChainId(ownChainId)
    await applyCustomRpc(ACTIVE)
    await confirmCustomRpcCandidate(ACTIVE)
    await applyCustomRpc(NEXT)
    stubChainId('0x1')

    const result = await confirmCustomRpcCandidate(NEXT)

    expect(result._unsafeUnwrapErr()).toMatchObject({ reason: 'wrong-chain' })
    expect(getCustomRpcCandidate()).toBeNull()
    expect(getCustomRpcUrl()).toBe(ACTIVE)
  })
})
