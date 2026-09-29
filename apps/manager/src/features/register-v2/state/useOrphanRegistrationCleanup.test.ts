import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrphanRegistrationCleanup } from './useOrphanRegistrationCleanup'

const pathname = { current: '/dashboard' }
const loadStoredRegistration = vi.fn()
const clearStoredRegistration = vi.fn()
const resolveOrphanRegistration = vi.fn()
const toast = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options: { select: (s: unknown) => unknown }) =>
    options.select({ location: { pathname: pathname.current } }),
}))

vi.mock('sonner', () => ({ toast: (...a: unknown[]) => toast(...a) }))

vi.mock('../service/orphanRegistrationCleanup', () => ({
  resolveOrphanRegistration: (...a: unknown[]) =>
    resolveOrphanRegistration(...a),
}))

vi.mock('../service/registrationPersistence', () => ({
  loadStoredRegistration: () => loadStoredRegistration(),
  clearStoredRegistration: () => clearStoredRegistration(),
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: { chain: { id: 11155111 } },
}))

const stored = { label: 'leon' }

describe('useOrphanRegistrationCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathname.current = '/dashboard'
    loadStoredRegistration.mockReturnValue(stored)
    resolveOrphanRegistration.mockResolvedValue({ status: 'pending' })
  })

  it('leaves the register route alone — the provider owns its own record', async () => {
    // Its preflight handles both the matching label and a stale one from
    // another name; racing it from here would clear a record mid-resume.
    pathname.current = '/register/leon'

    renderHook(() => useOrphanRegistrationCleanup())

    expect(resolveOrphanRegistration).not.toHaveBeenCalled()
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('does nothing when there is no stored record', () => {
    loadStoredRegistration.mockReturnValue(null)

    renderHook(() => useOrphanRegistrationCleanup())

    expect(resolveOrphanRegistration).not.toHaveBeenCalled()
  })

  it('clears and notifies when the registration landed while away', async () => {
    // The case the whole hook exists for: `/register/$name` redirects away on
    // success, so the provider never mounts to clear its own record.
    resolveOrphanRegistration.mockResolvedValue({
      status: 'registered',
      label: 'leon',
    })

    renderHook(() => useOrphanRegistrationCleanup())

    await waitFor(() => expect(clearStoredRegistration).toHaveBeenCalledOnce())
    expect(toast).toHaveBeenCalledOnce()
  })

  it('clears and notifies when the name was taken by someone else', async () => {
    resolveOrphanRegistration.mockResolvedValue({
      status: 'taken',
      label: 'leon',
    })

    renderHook(() => useOrphanRegistrationCleanup())

    await waitFor(() => expect(clearStoredRegistration).toHaveBeenCalledOnce())
    expect(toast).toHaveBeenCalledOnce()
  })

  it('keeps a still-pending record so the user can come back and resume', async () => {
    renderHook(() => useOrphanRegistrationCleanup())

    await waitFor(() => expect(resolveOrphanRegistration).toHaveBeenCalled())
    expect(clearStoredRegistration).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('keeps the record when the registry read fails', async () => {
    // A transient RPC error must not destroy a resumable registration; the
    // next navigation retries.
    resolveOrphanRegistration.mockRejectedValue(new Error('rpc down'))

    renderHook(() => useOrphanRegistrationCleanup())

    await waitFor(() => expect(resolveOrphanRegistration).toHaveBeenCalled())
    expect(clearStoredRegistration).not.toHaveBeenCalled()
  })

  it('decides once per record rather than on every navigation', async () => {
    resolveOrphanRegistration.mockResolvedValue({
      status: 'registered',
      label: 'leon',
    })

    const { rerender } = renderHook(() => useOrphanRegistrationCleanup())
    await waitFor(() => expect(clearStoredRegistration).toHaveBeenCalledOnce())

    pathname.current = '/profile'
    rerender()
    pathname.current = '/dashboard'
    rerender()

    // A second toast for a registration the user has already been told about.
    expect(toast).toHaveBeenCalledOnce()
  })
})
