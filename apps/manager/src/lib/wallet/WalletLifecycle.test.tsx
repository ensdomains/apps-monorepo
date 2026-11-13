import { transactionManager } from '@ens-apps/transaction-manager'
import { render } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, expect, it, vi } from 'vitest'
import { useConnectionEffect } from 'wagmi'
import { backendAuthStore } from '@/utils/backend-client'
import { clearAppLocalStorage } from './clearAppLocalStorage'
import { WalletLifecycle } from './WalletLifecycle'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { clearAllAndPersistence: vi.fn() },
}))
vi.mock('@/lib/posthog/events', () => ({ track: vi.fn() }))
vi.mock('wagmi', () => ({
  useConnection: () => ({}),
  useConnectionEffect: vi.fn(),
}))
vi.mock('@/utils/backend-client', () => ({
  backendAuthStore: { trigger: { signOut: vi.fn() } },
}))
vi.mock('./clearAppLocalStorage', () => ({ clearAppLocalStorage: vi.fn() }))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    get_explicit_consent_status: () => 'granted',
    reset: vi.fn(),
  },
}))

afterEach(() => vi.restoreAllMocks())

it('completes disconnect cleanup when the analytics reset throws', () => {
  vi.spyOn(posthog, 'reset').mockImplementation(() => {
    throw new Error('SDK unavailable')
  })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  render(<WalletLifecycle />)
  const onDisconnect =
    vi.mocked(useConnectionEffect).mock.calls[0]?.[0]?.onDisconnect
  if (!onDisconnect) throw new Error('Missing disconnect handler')

  expect(() => onDisconnect()).not.toThrow()
  expect(transactionManager.clearAllAndPersistence).toHaveBeenCalledOnce()
  expect(backendAuthStore.trigger.signOut).toHaveBeenCalledOnce()
  expect(clearAppLocalStorage).toHaveBeenCalledOnce()
})
