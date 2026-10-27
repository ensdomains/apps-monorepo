import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSubnameMigrationConfirmation } from './useSubnameMigrationConfirmation'
import type { SubnameMigrationImpactState } from './useSubnameMigrationImpact'

const UNKNOWN = `[${'ab'.repeat(32)}].alice.eth`

const makeImpact = (
  fingerprint: string,
  unrecoverable: readonly string[] = [UNKNOWN],
): SubnameMigrationImpactState => ({
  status: 'ready',
  impact: {
    parents: [],
    affectedCount: 0,
    unrecoverable,
    fingerprint,
    checkedAt: 0,
  },
  selectionKey: 'alice.eth',
  canReview: true,
  isBlocked: false,
  checkBeforeStart: vi.fn().mockResolvedValue(true),
  retry: vi.fn(),
})

const run = (impact: SubnameMigrationImpactState) => {
  const onConfirm = vi.fn().mockResolvedValue(true)
  const hook = renderHook(
    ({ state }) =>
      useSubnameMigrationConfirmation({ impact: state, onConfirm }),
    { initialProps: { state: impact } },
  )
  return { hook, onConfirm }
}

describe('useSubnameMigrationConfirmation', () => {
  it('starts straight away when nothing is lost', async () => {
    const { hook, onConfirm } = run(makeImpact('a', []))
    await act(() => hook.result.current.request('start'))
    expect(onConfirm).toHaveBeenCalledWith('start')
    expect(hook.result.current.isOpen).toBe(false)
  })

  it('asks before dropping unknown-label subnames and starts only once acknowledged', async () => {
    const { hook, onConfirm } = run(makeImpact('a'))
    await act(() => hook.result.current.request('start'))
    expect(hook.result.current.isOpen).toBe(true)

    await act(() => hook.result.current.confirm())
    expect(onConfirm).not.toHaveBeenCalled()

    act(() => hook.result.current.acknowledgeImpact(true))
    await act(() => hook.result.current.confirm())
    expect(onConfirm).toHaveBeenCalledWith('start')
  })

  it('needs a fresh acknowledgement when the dropped set changes', async () => {
    const { hook, onConfirm } = run(makeImpact('a'))
    await act(() => hook.result.current.request('start'))
    act(() => hook.result.current.acknowledgeImpact(true))

    hook.rerender({ state: makeImpact('b') })
    expect(hook.result.current.hasAcknowledgedImpact).toBe(false)
    await act(() => hook.result.current.confirm())
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
