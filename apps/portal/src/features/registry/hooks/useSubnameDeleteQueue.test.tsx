import { act, renderHook } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { SubnameRow } from '@/features/names/components/SubnamesTable'
import {
  type SubnameDeleteStepSpec,
  useSubnameDeleteQueue,
} from './useSubnameDeleteQueue'

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: true,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

const ACCOUNT: Address = '0x0000000000000000000000000000000000000011'
const ROW: SubnameRow = {
  name: 'sub.test.eth',
  owner: ACCOUNT,
  canDelete: true,
}
const step = (
  send: (id: string) => Promise<unknown> = () => Promise.resolve(),
): SubnameDeleteStepSpec => ({
  title: 'Delete subname',
  transactionName: 'Delete sub.test.eth',
  send,
})

const renderQueue = (initialSpecs: readonly SubnameDeleteStepSpec[]) =>
  renderHook(
    ({ specs }) =>
      useSubnameDeleteQueue({
        connectedAccount: ACCOUNT,
        servedNames: [ROW.name],
        stepsFor: () => specs,
      }),
    { initialProps: { specs: initialSpecs } },
  )

describe('useSubnameDeleteQueue', () => {
  it('keeps V2’s transaction id for a one-step row', () => {
    const { result } = renderQueue([step()])

    act(() => result.current.queue([ROW]))

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      expect.stringContaining('tx-delete-ens-subname-sub.test.eth'),
    ])
    expect(result.current.transactions[0]?.id).not.toMatch(/-0$/)
  })

  it('hides a row once its last step succeeds, while bigname still serves it', async () => {
    const { result } = renderQueue([step(), step()])

    act(() => result.current.queue([ROW]))
    const [wrap, remove] = result.current.transactions

    await act(async () => wrap?.onStart())
    expect(result.current.optimisticallyDeleted.has(ROW.name)).toBe(false)
    expect(result.current.pendingNames.has(ROW.name)).toBe(true)

    await act(async () => wrap?.onDone())
    await act(async () => remove?.onStart())

    expect(result.current.optimisticallyDeleted.has(ROW.name)).toBe(true)
    expect(result.current.pendingNames.has(ROW.name)).toBe(false)
  })

  it('keeps a row whose step fails, and undims it', async () => {
    const { result } = renderQueue([
      step(() => Promise.reject(new Error('rejected'))),
    ])

    act(() => result.current.queue([ROW]))
    await act(async () => result.current.transactions[0]?.onStart())

    expect(result.current.optimisticallyDeleted.has(ROW.name)).toBe(false)
    expect(result.current.pendingNames.has(ROW.name)).toBe(false)
  })

  it('queues nothing for a row with no steps', () => {
    const { result } = renderQueue([])

    act(() => result.current.queue([ROW]))

    expect(result.current.transactions).toEqual([])
  })

  // A list refresh mid-flow can change what a row would need; the queued
  // steps must still send what was checked when it was queued.
  it('sends the steps built when the row was queued, not a later answer', async () => {
    const queued = vi.fn(() => Promise.resolve())
    const later = vi.fn(() => Promise.resolve())
    const { result, rerender } = renderQueue([step(), step(queued)])

    act(() => result.current.queue([ROW]))
    rerender({ specs: [step(later)] })
    await act(async () => result.current.transactions[1]?.onStart())

    expect(queued).toHaveBeenCalledOnce()
    expect(later).not.toHaveBeenCalled()
  })
})
