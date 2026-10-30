import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { makeClassified, OWNER } from '../service/_fixtures'
import { getSubnameMigrationImpactQueryOptions } from '../service/subnameMigrationImpactQuery'
import { useSubnameMigrationImpact } from './useSubnameMigrationImpact'

const NOW = Math.floor(Date.now() / 1000)
const BLOCK_HASH = `0x${'11'.repeat(32)}`
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  rpc: vi.fn(),
  stale: false,
  hasChild: false,
  hasZeroCount: false,
}))
vi.mock('@posthog/react', () => ({ useFeatureFlagEnabled: () => false }))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: () => null,
}))
vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/indexer/bigname')
  return {
    bigname: createBignameClient('https://bigname.example', {
      fetch: (...args) => mocks.fetch(...args),
    }),
  }
})
vi.mock('@/lib/wagmi', async () => {
  const { createPublicClient, custom } = await import('viem')
  const { envConfig } = await import('@/config')
  return {
    publicClient: createPublicClient({
      chain: envConfig.chain,
      transport: custom(
        { request: (...args) => mocks.rpc(...args) },
        { retryCount: 0 },
      ),
    }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stale = false
  mocks.hasChild = false
  mocks.hasZeroCount = false
  mocks.rpc.mockResolvedValue({
    number: '0x1',
    timestamp: `0x${NOW.toString(16)}`,
    hash: BLOCK_HASH,
    transactions: [],
  })
  mocks.fetch.mockImplementation(async (input) => {
    const isCollection = new URL(String(input)).pathname.endsWith('/subnames')
    const row = {
      name: 'alice.eth',
      namehash: namehash('alice.eth'),
      namespace: 'ens',
      display_name: 'alice.eth',
      authority: 'ens_v1',
      status: 'active',
      owner: OWNER,
      ens_v1: { wrapper_state: 'unwrapped' },
      subname_count: mocks.hasChild ? 1 : mocks.hasZeroCount ? 0 : undefined,
      read_status: 'ok',
    }
    const children = mocks.hasChild
      ? [{ ...row, name: 'sub.alice.eth', namehash: namehash('sub.alice.eth') }]
      : []
    return Response.json({
      data: isCollection ? children : row,
      meta: {
        completeness: 'full',
        as_of: {
          [envConfig.chain.id]: {
            block_number: 1,
            block_hash: BLOCK_HASH,
            timestamp: String(mocks.stale ? 0 : NOW),
          },
        },
      },
      ...(isCollection && {
        page: {
          cursor: null,
          next_cursor: null,
          page_size: 200,
          has_more: false,
          total_count: children.length,
        },
      }),
    })
  })
})

const run = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await queryClient.fetchQuery(
    getSubnameMigrationImpactQueryOptions({
      ownerAddress: OWNER,
      chainId: envConfig.chain.id,
      migratingNames: ['alice.eth'],
      copiedNames: [],
      renewingNames: [],
      isEnabled: true,
      isPrepared: true,
      hasSelectedNames: true,
    }),
  )
  mocks.fetch.mockClear()
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const initialProps: { readonly managers: readonly string[] } = {
    managers: [],
  }
  return renderHook(
    ({ managers }: { readonly managers: readonly string[] }) =>
      useSubnameMigrationImpact({
        selectedNames: ['alice.eth'],
        classified: [makeClassified({ name: 'alice.eth' })],
        renewingNames: [],
        ownerAddress: OWNER,
        managerRestorationNames: managers,
        isEnabled: true,
        isPrepared: true,
        isRefetchEnabled: false,
      }),
    { wrapper, initialProps },
  )
}

describe('fresh start checks with shared impact evidence', () => {
  it('leaves an idle preview quiet and still verifies the wallet again before starting', async () => {
    vi.useFakeTimers()
    try {
      mocks.hasZeroCount = true
      const { result, unmount } = await run()
      const rpcReads = mocks.rpc.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000)
      })

      expect(mocks.fetch).not.toHaveBeenCalled()
      expect(mocks.rpc).toHaveBeenCalledTimes(rpcReads)
      await act(async () => {
        expect(await result.current.checkBeforeStart()).toBe(true)
      })
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still reads a fresh zero count before starting without fetching an empty child list', async () => {
    mocks.hasZeroCount = true
    const { result } = await run()

    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(true)
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
  it('reads again before starting even when display evidence is fresh', async () => {
    const { result } = await run()
    expect(result.current.status).toBe('ready')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.checkBeforeStart()).toBe(true)
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it.each(['stale', 'child', 'fetch', 'rpc'] as const)(
    'blocks starting when a fresh %s read no longer proves safety',
    async (kind) => {
      const { result } = await run()
      if (kind === 'stale') mocks.stale = true
      if (kind === 'child') mocks.hasChild = true
      if (kind === 'fetch')
        mocks.fetch.mockRejectedValueOnce(new Error('Indexer unavailable'))
      if (kind === 'rpc')
        mocks.rpc.mockRejectedValueOnce(new Error('RPC unavailable'))
      await act(async () => {
        expect(await result.current.checkBeforeStart()).toBe(false)
      })
    },
  )

  it('rejects a manager revision change during the same canonical query read', async () => {
    const { result, rerender } = await run()
    let release = (): void => {}
    const original = mocks.fetch.getMockImplementation()
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.fetch.mockImplementationOnce(async (...args) => {
      await gate
      return original?.(...args)
    })
    const check = result.current.checkBeforeStart()
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    rerender({ managers: ['alice.eth'] })
    await act(async () => {
      release()
      expect(await check).toBe(false)
    })
  })
})
