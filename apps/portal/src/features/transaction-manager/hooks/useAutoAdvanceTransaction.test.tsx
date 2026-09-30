import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../types'
import { useAutoAdvanceTransaction } from './useAutoAdvanceTransaction'

const makeTransaction = (id: string, onDone: () => void): Transaction => ({
  id,
  title: id,
  transactionName: id,
  onStart: () => {},
  onDone,
})

describe('useAutoAdvanceTransaction', () => {
  it('advances the flow when the active step of this attempt succeeds', () => {
    const onDone = vi.fn()
    const transactions = [
      makeTransaction('step-1', onDone),
      makeTransaction('step-2', vi.fn()),
    ]

    renderHook(() => useAutoAdvanceTransaction('step-1', transactions))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ignores a successful step belonging to another attempt', () => {
    // Step ids carry the attempt they were created for, so the id a stale
    // actor reports is not one of this attempt's — nothing may advance.
    const onDone = vi.fn()
    const transactions = [
      makeTransaction('step-1--attempt-2', onDone),
      makeTransaction('step-2--attempt-2', vi.fn()),
    ]

    renderHook(() =>
      useAutoAdvanceTransaction('step-1--attempt-1', transactions),
    )

    expect(onDone).not.toHaveBeenCalled()
  })

  it('leaves the last step to the user', () => {
    const onDone = vi.fn()
    const transactions = [makeTransaction('only-step', onDone)]

    renderHook(() => useAutoAdvanceTransaction('only-step', transactions))

    expect(onDone).not.toHaveBeenCalled()
  })
})
