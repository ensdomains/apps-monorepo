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
const STEP: SubnameDeleteStepSpec = {
  title: 'Delete subname',
  transactionName: 'Delete sub.test.eth',
}

const renderQueue = ({
  specs,
  runStep,
}: {
  readonly specs: readonly SubnameDeleteStepSpec[]
  readonly runStep: () => Promise<unknown>
}) =>
  renderHook(() =>
    useSubnameDeleteQueue({
      connectedAccount: ACCOUNT,
      servedNames: [ROW.name],
      stepsFor: () => specs,
      runStep,
    }),
  )

describe('useSubnameDeleteQueue', () => {
  it('keeps V2’s transaction id for a one-step row', () => {
    const { result } = renderQueue({
      specs: [STEP],
      runStep: () => Promise.resolve(),
    })

    act(() => result.current.queue([ROW]))

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      expect.stringContaining('tx-delete-ens-subname-sub.test.eth'),
    ])
    expect(result.current.transactions[0]?.id).not.toMatch(/-0$/)
  })

  it('hides a row once its last step succeeds, while bigname still serves it', async () => {
    const { result } = renderQueue({
      specs: [STEP, STEP],
      runStep: () => Promise.resolve(),
    })

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
    const { result } = renderQueue({
      specs: [STEP],
      runStep: () => Promise.reject(new Error('rejected')),
    })

    act(() => result.current.queue([ROW]))
    await act(async () => result.current.transactions[0]?.onStart())

    expect(result.current.optimisticallyDeleted.has(ROW.name)).toBe(false)
    expect(result.current.pendingNames.has(ROW.name)).toBe(false)
  })

  it('queues nothing for a row with no steps', () => {
    const { result } = renderQueue({
      specs: [],
      runStep: () => Promise.resolve(),
    })

    act(() => result.current.queue([ROW]))

    expect(result.current.transactions).toEqual([])
  })
})
