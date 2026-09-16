import {
  buildRegistrationRecord,
  type Signer,
} from '@ens-apps/transaction-manager'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { ReactNode } from 'react'
import type { Address, Hash, Hex } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistrationResumeVerdict } from '../utils/registrationResume'
import {
  DISCONNECT_GRACE_MS,
  useRegistrationResume,
} from './useRegistrationResume'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address

type Connection = {
  address?: Address
  isConnecting: boolean
  isReconnecting: boolean
  isDisconnected: boolean
}
const connected = (address: Address): Connection => ({
  address,
  isConnecting: false,
  isReconnecting: false,
  isDisconnected: false,
})
const DISCONNECTED: Connection = {
  isConnecting: false,
  isReconnecting: false,
  isDisconnected: true,
}

const connection = { current: connected(OWNER) }
const config = {}
const assess = vi.fn<() => Promise<RegistrationResumeVerdict>>()

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => config,
  useConnection: () => connection.current,
}))
vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: vi.fn(async () => ({})),
}))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('../utils/registrationPersistence', () => ({
  loadStoredRegistration: () => null,
  clearStoredRegistration: vi.fn(),
}))
vi.mock('../utils/registrationResume', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/registrationResume')>()),
  assessRegistrationResume: () => assess(),
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))

const resumable: RegistrationResumeVerdict = {
  status: 'resumable',
  record: buildRegistrationRecord(
    'commitmentCooldown',
    {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: OWNER,
      ownerAddress: OWNER,
      commitment: {
        commitment: `0x${'ab'.repeat(32)}` as Hash,
        secret: `0x${'cd'.repeat(32)}` as Hex,
      },
    },
    1,
  ),
  token: { symbol: 'USDC' } as never,
  commitmentOnChain: true,
}

/** A run started on this page by OWNER; nothing was stored when it opened. */
const renderLiveRun = () => {
  const onResume = vi.fn(() => true)
  const onSuspend = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = renderHook(
    ({ runOwner }: { runOwner?: Address }) =>
      useRegistrationResume({
        name: 'leon.eth',
        onResume,
        suspendableRunOwner: runOwner,
        onSuspend,
      }),
    {
      initialProps: { runOwner: OWNER as Address | undefined },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )
  return { ...view, onResume, onSuspend, queryClient }
}

describe('useRegistrationResume while a run is live', () => {
  beforeEach(async () => {
    connection.current = connected(OWNER)
    assess.mockResolvedValue({ status: 'none' })
  })
  afterEach(() => vi.useRealTimers())

  it('stops the run when a different wallet connects, and shows it nothing', async () => {
    // Otherwise the run carried on with the first wallet's signer under the
    // second wallet, until a reload.
    const { result, rerender, onSuspend, onResume, queryClient } =
      renderLiveRun()
    await waitFor(() => expect(assess).toHaveBeenCalled())

    assess.mockResolvedValue(resumable)
    connection.current = connected(OTHER)
    rerender({ runOwner: OWNER })

    expect(onSuspend).toHaveBeenCalledOnce()
    rerender({ runOwner: undefined }) // The run is idle now.
    await waitFor(() => expect(assess).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(result.current).toEqual({ status: 'idle' })
    expect(onResume).not.toHaveBeenCalled()
  })

  it('stops the run once a disconnect outlasts the grace period', async () => {
    const { result, rerender, onSuspend } = renderLiveRun()
    await waitFor(() => expect(assess).toHaveBeenCalled())

    assess.mockResolvedValue(resumable)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    connection.current = DISCONNECTED
    rerender({ runOwner: OWNER })

    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1))
    expect(onSuspend).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSuspend).toHaveBeenCalledOnce()
    vi.useRealTimers()

    rerender({ runOwner: undefined })
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'await-owner', owner: OWNER }),
    )
  })

  it('rides out a disconnect shorter than the grace period', async () => {
    const { rerender, onSuspend } = renderLiveRun()
    await waitFor(() => expect(assess).toHaveBeenCalled())

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    connection.current = DISCONNECTED
    rerender({ runOwner: OWNER })
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS / 2))
    connection.current = connected(OWNER)
    rerender({ runOwner: OWNER })
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2))

    expect(onSuspend).not.toHaveBeenCalled()
  })

  it('resumes the stopped run when its owner comes back', async () => {
    const { rerender, onSuspend, onResume } = renderLiveRun()
    await waitFor(() => expect(assess).toHaveBeenCalled())

    assess.mockResolvedValue(resumable)
    connection.current = connected(OTHER)
    rerender({ runOwner: OWNER })
    expect(onSuspend).toHaveBeenCalledOnce()
    rerender({ runOwner: undefined })

    connection.current = connected(OWNER)
    rerender({ runOwner: undefined })

    await waitFor(() => expect(onResume).toHaveBeenCalledOnce())
  })
})
