// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discardCustomRpcCandidate,
  getCustomRpcCandidate,
  getCustomRpcUrl,
  promoteCustomRpcCandidate,
} from '@/lib/customRpc'
import { applyCustomRpc } from './RpcSettingsDialog.handlers'

const reload = vi.fn()
const FIRST = 'https://rpc.example.com/key'
const SECOND = 'https://next.example.com/key'

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

// Saves `url` and returns the candidate as the next load reads it.
const propose = async (url: string) => {
  await applyCustomRpc(url)
  const candidate = getCustomRpcCandidate()
  if (candidate === null) throw new Error('candidate was not stored')
  return candidate
}

describe('custom RPC save flow', () => {
  it('stores a new URL as the candidate without probing it', async () => {
    // The page can't reach the new origin until a reload allows it.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect((await applyCustomRpc(` ${FIRST} `)).isOk()).toBe(true)

    expect(getCustomRpcCandidate()?.url).toBe(FIRST)
    expect(getCustomRpcUrl()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('promotes the candidate that was checked', async () => {
    const candidate = await propose(FIRST)

    expect((await promoteCustomRpcCandidate(candidate)).isOk()).toBe(true)

    expect(getCustomRpcUrl()).toBe(FIRST)
    expect(getCustomRpcCandidate()).toBeNull()
  })

  it('ignores a late check once another save replaced its candidate', async () => {
    // Another tab saved again while this one was still checking.
    const stale = await propose(FIRST)
    await propose(SECOND)

    await promoteCustomRpcCandidate(stale)
    await discardCustomRpcCandidate(stale)

    expect(getCustomRpcUrl()).toBeNull()
    expect(getCustomRpcCandidate()?.url).toBe(SECOND)
  })

  it('tells two saves of the same URL apart', async () => {
    const stale = await propose(FIRST)
    const fresh = await propose(FIRST)

    await discardCustomRpcCandidate(stale)

    expect(getCustomRpcCandidate()).toEqual(fresh)
  })
})
