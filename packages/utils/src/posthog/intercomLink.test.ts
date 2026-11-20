import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createIntercomAnalyticsLink } from './intercomLink'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('drops a stale readiness retry and links the new current context only once', async () => {
  let context = { key: 'wallet-a:1', distinctId: 'wallet-a' }
  let visitorId: string | undefined
  const link = vi.fn()
  const linkage = createIntercomAnalyticsLink({
    getContext: () => context,
    getVisitorId: () => visitorId,
    link,
  })
  linkage.sync()
  context = { key: 'wallet-b:2', distinctId: 'wallet-b' }
  visitorId = 'visitor'
  await vi.advanceTimersByTimeAsync(1000)
  expect(link).not.toHaveBeenCalled()
  linkage.sync()
  linkage.sync()
  expect(link).toHaveBeenCalledExactlyOnceWith(context, 'visitor')
})

it('stops after withdrawal, cancellation or a widget that never becomes ready', async () => {
  let isAllowed = true
  const getVisitorId = vi.fn(() => undefined)
  const link = vi.fn()
  const linkage = createIntercomAnalyticsLink({
    getContext: () =>
      isAllowed ? { key: 'wallet:1', distinctId: 'wallet' } : undefined,
    getVisitorId,
    link,
  })
  linkage.sync()
  isAllowed = false
  await vi.advanceTimersByTimeAsync(1000)
  expect(vi.getTimerCount()).toBe(0)
  expect(link).not.toHaveBeenCalled()
  isAllowed = true
  linkage.sync()
  linkage.cancel()
  await vi.advanceTimersByTimeAsync(1000)
  expect(vi.getTimerCount()).toBe(0)
  linkage.sync()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(vi.getTimerCount()).toBe(0)
  expect(link).not.toHaveBeenCalled()
})
