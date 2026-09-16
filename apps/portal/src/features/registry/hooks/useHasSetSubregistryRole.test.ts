import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAccount = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const parentRegistry = '0x1111111111111111111111111111111111111111' as const
const leafRegistry = '0x2222222222222222222222222222222222222222' as const

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: mockAccount }),
  }
})

const registriesQuery: {
  data: unknown
  error: Error | null
  isLoading: boolean
} = {
  data: undefined,
  error: null,
  isLoading: false,
}

const hasRolesQuery: {
  data: unknown
  error: Error | null
  isLoading: boolean
} = {
  data: undefined,
  error: null,
  isLoading: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey[0]
      if (key === 'nameRegistries') return registriesQuery
      if (key === 'hasRoles') return hasRolesQuery
      return { data: undefined, error: null, isLoading: false }
    },
  }
})

const { useHasSetSubregistryRole } = await import('./useHasSetSubregistryRole')

describe('useHasSetSubregistryRole', () => {
  beforeEach(() => {
    registriesQuery.data = [leafRegistry, parentRegistry, zeroAddress]
    registriesQuery.error = null
    registriesQuery.isLoading = false
    hasRolesQuery.data = true
    hasRolesQuery.error = null
    hasRolesQuery.isLoading = false
  })

  it('returns hasRole true when the role check succeeds', () => {
    const { result } = renderHook(() => useHasSetSubregistryRole('test.eth'))

    expect(result.current.hasRole).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('returns hasRole false when the account lacks the role', () => {
    hasRolesQuery.data = false

    const { result } = renderHook(() => useHasSetSubregistryRole('test.eth'))

    expect(result.current.hasRole).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns hasRole undefined when the registries query errors', () => {
    const registriesError = new Error('registries failed')
    registriesQuery.error = registriesError
    hasRolesQuery.data = true

    const { result } = renderHook(() => useHasSetSubregistryRole('test.eth'))

    expect(result.current.hasRole).toBeUndefined()
    expect(result.current.error).toBe(registriesError)
  })

  it('returns hasRole undefined when the role query errors', () => {
    const roleError = new Error('role check failed')
    hasRolesQuery.error = roleError

    const { result } = renderHook(() => useHasSetSubregistryRole('test.eth'))

    expect(result.current.hasRole).toBeUndefined()
    expect(result.current.error).toBe(roleError)
  })

  it('reports loading while registries or role queries are in flight', () => {
    registriesQuery.isLoading = true
    hasRolesQuery.data = undefined

    const { result, rerender } = renderHook(() =>
      useHasSetSubregistryRole('test.eth'),
    )

    expect(result.current.isLoading).toBe(true)

    registriesQuery.isLoading = false
    hasRolesQuery.isLoading = true
    rerender()

    expect(result.current.isLoading).toBe(true)

    hasRolesQuery.isLoading = false
    hasRolesQuery.data = true
    rerender()

    expect(result.current.isLoading).toBe(false)
  })

  it('does not report loading when the hook is disabled', () => {
    registriesQuery.isLoading = true

    const { result } = renderHook(() =>
      useHasSetSubregistryRole('test.eth', { enabled: false }),
    )

    expect(result.current.isLoading).toBe(false)
  })
})
