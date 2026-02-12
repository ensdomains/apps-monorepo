import { describe, expect, it, vi } from 'vitest'
import {
  createRunTelemetryService,
  estimateTelemetryBytes,
} from './run-telemetry.service'

function createSnapshot(state: unknown, overrides?: Record<string, unknown>) {
  return {
    value: state,
    context: {
      hash: '0xabc',
      retryCount: 1,
      chainId: 11155111,
      request: { type: 'eoa' },
      signer: { type: 'eoa' },
      ...overrides,
    },
  }
}

describe('run telemetry service', () => {
  it('does not emit payload for successful runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-12T00:00:00.000Z'))

    const service = createRunTelemetryService()
    service.startRun('tx-1', {
      chainId: 11155111,
      requestType: 'eoa',
      signerType: 'eoa',
    })
    service.recordSnapshot('tx-1', createSnapshot('submitting'))
    service.recordSnapshot('tx-1', createSnapshot('success'))

    const payload = service.completeRun('tx-1', 'success')
    expect(payload).toBeNull()

    vi.useRealTimers()
  })

  it('returns payload for failed runs', () => {
    const service = createRunTelemetryService()
    service.startRun('tx-2', {
      chainId: 11155111,
      requestType: 'rhinestone-intent',
      signerType: 'rhinestone',
    })
    service.recordSnapshot('tx-2', createSnapshot('submitting'))
    service.recordSnapshot(
      'tx-2',
      createSnapshot({ error: 'submission' }, { error: new Error('boom') }),
    )

    const payload = service.completeRun('tx-2', 'error')

    expect(payload).not.toBeNull()
    expect(payload?.status).toBe('error')
    expect(payload?.txId).toBe('tx-2')
    expect(payload?.eventCount).toBe(2)
    expect(payload?.summary.finalState).toContain('error')
  })

  it('marks oversized payloads as truncated and fits under limit', () => {
    const service = createRunTelemetryService()
    service.startRun('tx-3')

    for (let i = 0; i < 5000; i += 1) {
      service.recordSnapshot(
        'tx-3',
        createSnapshot('error', {
          error: new Error(`very-long-error-${'x'.repeat(350)}`),
        }),
      )
    }

    const payload = service.completeRun('tx-3', 'cancelled')

    expect(payload).not.toBeNull()
    expect(payload?.status).toBe('cancelled')
    expect(payload?.truncated).toBe(true)
    expect((payload?.droppedEvents || 0) > 0).toBe(true)
    expect(estimateTelemetryBytes(payload)).toBeLessThanOrEqual(900 * 1024)
  })
})
