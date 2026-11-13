import type { V1Domain } from '@ens-apps/migration'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { okAsync } from 'neverthrow'
import { createElement, type ReactNode } from 'react'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDomain } from '../service/_fixtures'
import { useSyncRenewedV1Names } from './useSyncRenewedV1Names'
import { useV1Names } from './useV1Names'

const OWNER: Address = '0xAbCdEf0000000000000000000000000000000001'

type UiContext = {
  renewedDomains?: readonly V1Domain[]
  renewal?: { quote: { ownerAddress: Address } }
}

const mocks = vi.hoisted(() => ({
  getV1Names: vi.fn(),
  context: {} as UiContext,
  listeners: new Set<() => void>(),
}))

vi.mock('@/features/migration/service/v1Names', () => ({
  getV1NamesForAddress: mocks.getV1Names,
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({ ownerAddress: OWNER }),
}))
vi.mock('wagmi', () => ({
  useConnection: () => ({ address: undefined }),
}))
// A minimal actor: `useSelector` only needs getSnapshot + subscribe.
const uiActor = {
  getSnapshot: () => ({ context: mocks.context }),
  subscribe: (listener: () => void) => {
    mocks.listeners.add(listener)
    return { unsubscribe: () => mocks.listeners.delete(listener) }
  },
}
vi.mock('../state/migrationUi.context', () => ({
  useMigrationUiContext: () => ({ uiActor }),
}))

const setUiContext = (context: UiContext) => {
  mocks.context = context
  for (const listener of mocks.listeners) listener()
}

const inGrace = makeDomain({ id: namehash('grace.eth'), name: 'grace.eth' })
const active = makeDomain({ id: namehash('active.eth'), name: 'active.eth' })
const renewed: V1Domain = {
  ...inGrace,
  registration: { expiryDate: '4102444800' },
}

let queryClient: QueryClient
const wrapper = ({ children }: { readonly children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children)

const renderBoth = () =>
  renderHook(
    () => {
      useSyncRenewedV1Names()
      return useV1Names()
    },
    { wrapper },
  )

beforeEach(() => {
  mocks.context = {}
  mocks.listeners.clear()
  mocks.getV1Names.mockReset()
  mocks.getV1Names.mockImplementation(() => okAsync([inGrace, active]))
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  queryClient.clear()
})

describe('useSyncRenewedV1Names → useV1Names', () => {
  it('replaces the renewed domain in the list useV1Names reads, keeping the rest', async () => {
    const { result } = renderBoth()
    await waitFor(() => expect(result.current.data).toEqual([inGrace, active]))

    setUiContext({
      renewedDomains: [renewed],
      // The quote's checksummed owner must still hit the lowercased cache key.
      renewal: { quote: { ownerAddress: OWNER } },
    })

    await waitFor(() => expect(result.current.data).toEqual([renewed, active]))
    // Patched in place, not refetched.
    expect(mocks.getV1Names).toHaveBeenCalledTimes(1)
  })

  it('does not touch another owner’s cached names', async () => {
    const other: Address = '0x0000000000000000000000000000000000000002'
    const { result } = renderBoth()
    await waitFor(() => expect(result.current.data).toEqual([inGrace, active]))

    setUiContext({
      renewedDomains: [renewed],
      renewal: { quote: { ownerAddress: other } },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.data).toEqual([inGrace, active])
  })

  it('writes nothing until a renewal has completed', async () => {
    const { result } = renderBoth()
    await waitFor(() => expect(result.current.data).toEqual([inGrace, active]))

    setUiContext({ renewal: { quote: { ownerAddress: OWNER } } })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.data).toEqual([inGrace, active])
  })
})
