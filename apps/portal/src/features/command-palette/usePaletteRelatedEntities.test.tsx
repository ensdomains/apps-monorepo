import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { usePaletteRelatedEntities } from './usePaletteRelatedEntities'

const io = vi.hoisted(() => ({
  owner: vi.fn(),
  availability: vi.fn(),
  ethAddress: vi.fn(),
  resolver: vi.fn(),
  primaryName: vi.fn(),
  profile: vi.fn(),
}))
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['owner', { name }],
    queryFn: () => io.owner(name),
  }),
}))
vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['availability', { name }],
    queryFn: () => io.availability(name),
  }),
}))
vi.mock('@/features/transfer/queries/getEthAddress', () => ({
  getEthAddressQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['eth-address', { name }],
    queryFn: () => io.ethAddress(name),
  }),
}))
vi.mock('@/features/records/hooks/useNameResolverAddress', () => ({
  getNameResolverAddressQueryOptions: ({
    name,
  }: {
    readonly name: string
  }) => ({
    queryKey: ['resolver', { name }],
    queryFn: () => io.resolver(name),
  }),
}))
vi.mock('@/features/profile/hooks/usePrimaryName', () => ({
  getPrimaryNameQueryOptions: (address: string | undefined) => ({
    queryKey: ['primary-name', { address }],
    queryFn: () => io.primaryName(address),
  }),
}))
vi.mock('@/features/profile/hooks/useProfile', () => ({
  getProfileQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['profile', { name }],
    queryFn: () => io.profile(name),
  }),
}))
const OWNER = '0x1111111111111111111111111111111111111111'
const ETH_ADDRESS = '0x2222222222222222222222222222222222222222'
const RESOLVER = '0x3333333333333333333333333333333333333333'
const ENTITY = { type: 'name', name: 'helgesson.eth' } as const
const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  io.availability.mockResolvedValue({ isAvailable: false })
  io.owner.mockResolvedValue({ owner: OWNER })
  io.ethAddress.mockResolvedValue(ETH_ADDRESS)
  io.resolver.mockResolvedValue(RESOLVER)
  io.primaryName.mockResolvedValue('primary.eth')
})

it('withholds cached legacy facts and downstream reads while checking registration', async () => {
  const { client, wrapper } = makeWrapper()
  let finish: (data: { readonly isAvailable: boolean }) => void = () => {}
  io.availability.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  client.setQueryData(['owner', { name: ENTITY.name }], { owner: OWNER })
  client.setQueryData(['eth-address', { name: ENTITY.name }], ETH_ADDRESS)
  client.setQueryData(['resolver', { name: ENTITY.name }], RESOLVER)
  const { result } = renderHook(() => usePaletteRelatedEntities(ENTITY, true), {
    wrapper,
  })
  expect(result.current.entities).toEqual([])
  expect(result.current.isLoading).toBe(true)
  expect(io.owner).not.toHaveBeenCalled()
  expect(io.ethAddress).not.toHaveBeenCalled()
  expect(io.resolver).not.toHaveBeenCalled()
  await act(async () => finish({ isAvailable: true }))
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.entities).toEqual([])
  expect(io.owner).not.toHaveBeenCalled()
  expect(io.ethAddress).not.toHaveBeenCalled()
  expect(io.resolver).not.toHaveBeenCalled()
  expect(io.profile).not.toHaveBeenCalled()
})

it('loads narrow relationships once and reuses fresh queries on reopening', async () => {
  const { wrapper } = makeWrapper()
  const { result, rerender } = renderHook(
    ({ isEnabled }) => usePaletteRelatedEntities(ENTITY, isEnabled),
    {
      wrapper,
      initialProps: { isEnabled: true },
    },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.entities.map(({ relations }) => relations)).toEqual([
    ['owner'],
    ['eth-address'],
    ['resolver'],
  ])
  await act(async () => rerender({ isEnabled: false }))
  await act(async () => rerender({ isEnabled: true }))
  expect(io.availability).toHaveBeenCalledExactlyOnceWith(ENTITY.name)
  expect(io.owner).toHaveBeenCalledExactlyOnceWith(ENTITY.name)
  expect(io.ethAddress).toHaveBeenCalledExactlyOnceWith(ENTITY.name)
  expect(io.resolver).toHaveBeenCalledExactlyOnceWith(ENTITY.name)
  expect(io.primaryName).not.toHaveBeenCalled()
  expect(io.profile).not.toHaveBeenCalled()
})

it('retains offchain DNS relationships without requiring a registry owner or ETH registration check', async () => {
  io.owner.mockResolvedValue(null)
  const { wrapper } = makeWrapper()
  const { result } = renderHook(
    () =>
      usePaletteRelatedEntities({ type: 'name', name: 'helgesson.xyz' }, true),
    { wrapper },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.entities.map(({ relations }) => relations)).toEqual([
    ['eth-address'],
    ['resolver'],
  ])
  expect(io.availability).not.toHaveBeenCalled()
})

it('recovers a failed registration check before starting any relationship reads', async () => {
  io.availability.mockRejectedValueOnce(new Error('RPC unavailable'))
  const { wrapper } = makeWrapper()
  const { result } = renderHook(() => usePaletteRelatedEntities(ENTITY, true), {
    wrapper,
  })
  await waitFor(() => expect(result.current.hasError).toBe(true))
  expect(io.owner).not.toHaveBeenCalled()
  expect(io.ethAddress).not.toHaveBeenCalled()
  await act(async () => {
    await result.current.retry()
  })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.hasError).toBe(false)
  expect(io.availability.mock.calls).toEqual([[ENTITY.name], [ENTITY.name]])
  expect(io.ethAddress).toHaveBeenCalledExactlyOnceWith(ENTITY.name)
})

it('retries only a failed relationship and preserves the successful ones', async () => {
  io.ethAddress.mockRejectedValueOnce(new Error('Resolver unavailable'))
  const { wrapper } = makeWrapper()
  const { result } = renderHook(() => usePaletteRelatedEntities(ENTITY, true), {
    wrapper,
  })
  await waitFor(() => expect(result.current.hasError).toBe(true))
  await act(async () => {
    await result.current.retry()
  })
  await waitFor(() => expect(result.current.hasError).toBe(false))
  expect(io.ethAddress.mock.calls).toEqual([[ENTITY.name], [ENTITY.name]])
  expect(io.owner).toHaveBeenCalledOnce()
  expect(io.resolver).toHaveBeenCalledOnce()
  expect(io.availability).toHaveBeenCalledOnce()
})

it('queries only a primary name when explicitly exploring an address', async () => {
  const { wrapper } = makeWrapper()
  const { result } = renderHook(
    () => usePaletteRelatedEntities({ type: 'address', address: OWNER }, true),
    { wrapper },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.entities).toEqual([
    {
      entity: { type: 'name', name: 'primary.eth' },
      relations: ['primary-name'],
    },
  ])
  expect(io.primaryName).toHaveBeenCalledExactlyOnceWith(OWNER)
  expect(io.availability).not.toHaveBeenCalled()
  expect(io.owner).not.toHaveBeenCalled()
  expect(io.ethAddress).not.toHaveBeenCalled()
  expect(io.resolver).not.toHaveBeenCalled()
})

it('checks the governing registration before resolving a subname', async () => {
  io.availability.mockResolvedValue({ isAvailable: true })
  const { wrapper } = makeWrapper()
  const { result } = renderHook(
    () =>
      usePaletteRelatedEntities(
        { type: 'name', name: 'sub.helgesson.eth' },
        true,
      ),
    { wrapper },
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(io.availability).toHaveBeenCalledExactlyOnceWith('helgesson.eth')
  expect(io.ethAddress).not.toHaveBeenCalled()
  expect(io.owner).not.toHaveBeenCalled()
  expect(result.current.entities).toEqual([
    { entity: { type: 'name', name: 'helgesson.eth' }, relations: ['parent'] },
  ])
})
