import { describe, expect, it, vi } from 'vitest'
import { createRenewalAnalytics } from './renewalAnalytics'

describe('renewal analytics', () => {
  it('records partial progress and completes a batch only once after all receipt callbacks', () => {
    const capture = vi.fn()
    const analytics = createRenewalAnalytics(3, 11155111, { capture })
    const onStart = vi.fn()
    const onDone = vi.fn()
    const transactions = analytics.decorate([
      { id: 'approval', title: '', transactionName: '', onStart, onDone },
      { id: 'renew-v1', title: '', transactionName: '', onStart, onDone },
      { id: 'renew-v2', title: '', transactionName: '', onStart, onDone },
    ])
    transactions[0]?.onStart()
    transactions[0]?.onDone()
    transactions[1]?.onDone()
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:flow_complete'),
    ).toEqual([])
    transactions[2]?.onDone()
    transactions[2]?.onDone()
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:step_result'),
    ).toHaveLength(3)
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:flow_complete'),
    ).toEqual([
      [
        'renewal:flow_complete',
        {
          flow_id: capture.mock.calls[0]?.[1].flow_id,
          chain_id: 11155111,
          item_count: 3,
        },
      ],
    ])
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(4)
  })
})
