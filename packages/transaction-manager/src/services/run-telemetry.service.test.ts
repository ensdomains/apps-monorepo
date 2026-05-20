import { describe, expect, it, vi } from 'vitest'
import type { Signer } from '../types/signer.types'
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
      request: {
        type: 'eoa',
        from: '0xfrom',
        to: '0xto',
        value: 1n,
        data: '0x12345678abcdef',
      },
      signer: { type: 'eoa' },
      options: {
        timeout: 3000,
      },
      ...overrides,
    },
  }
}

describe('run telemetry service v2', () => {
  it('does not emit payload for successful runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-12T00:00:00.000Z'))

    const service = createRunTelemetryService()
    service.startRun({
      txId: 'tx-1',
      chainId: 11155111,
      request: {
        type: 'eoa',
        chainId: 11155111,
        from: '0xfrom',
        to: '0xto',
        data: '0x12345678abcdef',
      },
      signer: { type: 'eoa' } as unknown as Signer,
      options: {
        retryCount: 3,
      },
      useSmartAccount: false,
    })
    service.recordSnapshot('tx-1', createSnapshot('submitting'))
    service.recordSnapshot('tx-1', createSnapshot('success'))

    const payload = service.completeRun('tx-1', 'success')
    expect(payload).toBeNull()

    vi.useRealTimers()
  })

  it('includes initial snapshot with full calldata and derived fields', () => {
    const service = createRunTelemetryService()
    service.startRun({
      txId: 'tx-2',
      chainId: 11155111,
      request: {
        type: 'eoa',
        chainId: 11155111,
        from: '0xfrom',
        to: '0xto',
        data: '0x12345678abcdef',
        value: 2n,
      },
      signer: { type: 'erc4337' } as unknown as Signer,
      useSmartAccount: true,
      options: {
        retryCount: 3,
        timeout: 3000,
      },
    })

    service.recordSnapshot('tx-2', createSnapshot('submitting'))
    service.recordSnapshot(
      'tx-2',
      createSnapshot({ error: 'submission' }, { error: new Error('boom') }),
    )

    const payload = service.completeRun('tx-2', 'error')

    expect(payload).not.toBeNull()
    expect(payload?.schemaVersion).toBe('tm-failed-run-v2')
    expect(payload?.initial.request?.data).toBe('0x12345678abcdef')
    expect(payload?.initial.request?.dataBytes).toBe(7)
    expect(payload?.initial.request?.dataSelector).toBe('0x12345678')
    expect(payload?.initial.smartAccount.enabled).toBe(true)
    expect(payload?.summary.requestFingerprint).toBeTruthy()
  })

  it('suppresses unchanged sticky error on non-error phases', () => {
    const service = createRunTelemetryService()
    service.startRun({
      txId: 'tx-3',
      request: {
        type: 'eoa',
        chainId: 11155111,
        from: '0xfrom',
        to: '0xto',
      },
      signer: { type: 'eoa' } as unknown as Signer,
    })

    service.recordSnapshot(
      'tx-3',
      createSnapshot('retrying', { error: new Error('Failed to submit') }),
    )
    const nonError = service.recordSnapshot(
      'tx-3',
      createSnapshot('submitting', { error: new Error('Failed to submit') }),
    )

    expect(nonError?.event.error).toBeUndefined()
  })

  it('serializes cause chain depth=2 and stack only on terminal error', () => {
    const service = createRunTelemetryService()
    const leaf = new Error('leaf')
    const mid = Object.assign(new Error('mid'), { cause: leaf })
    const root = Object.assign(new Error('root'), { cause: mid })

    service.startRun({
      txId: 'tx-4',
      request: {
        type: 'eoa',
        chainId: 11155111,
        from: '0xfrom',
        to: '0xto',
      },
      signer: { type: 'eoa' } as unknown as Signer,
    })

    const retryEvent = service.recordSnapshot(
      'tx-4',
      createSnapshot('retrying', { error: root }),
    )
    service.recordSnapshot(
      'tx-4',
      createSnapshot({ error: 'submission' }, { error: root }),
    )

    const payload = service.completeRun('tx-4', 'error')
    const finalError = payload?.summary.finalError

    expect(retryEvent?.event.error?.stack).toBeUndefined()
    expect(finalError?.stack).toContain('Error: root')
    expect(finalError?.cause?.message).toBe('mid')
    expect(finalError?.cause?.cause?.message).toBe('leaf')
    expect(finalError?.cause?.cause?.cause).toBeUndefined()
  })

  it('marks oversized payloads as truncated and keeps size <= limit', () => {
    const service = createRunTelemetryService()
    service.startRun({
      txId: 'tx-5',
      request: {
        type: 'eoa',
        chainId: 11155111,
        from: '0xfrom',
        to: '0xto',
      },
      signer: { type: 'eoa' } as unknown as Signer,
    })

    for (let i = 0; i < 5000; i += 1) {
      service.recordSnapshot(
        'tx-5',
        createSnapshot('error', {
          retryCount: i,
          error: new Error(`very-long-error-${'x'.repeat(350)}`),
        }),
      )
    }

    const payload = service.completeRun('tx-5', 'cancelled')

    expect(payload).not.toBeNull()
    expect(payload?.truncation.truncated).toBe(true)
    expect((payload?.truncation.droppedEvents || 0) > 0).toBe(true)
    expect(estimateTelemetryBytes(payload)).toBeLessThanOrEqual(900 * 1024)
  })
})
