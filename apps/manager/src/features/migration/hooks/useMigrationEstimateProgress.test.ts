import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMigrationEstimateProgress } from './useMigrationEstimateProgress'

describe('useMigrationEstimateProgress', () => {
  it.each([
    ['checking-names', 8],
    ['finding-records', 25],
    ['reading-records', 41],
    ['preparing-upgrade', 58],
    ['checking-upgrade', 75],
    ['checking-fee', 91],
  ] as const)(
    'reports overall progress during %s',
    async (stage, percentage) => {
      const { result } = renderHook(() =>
        useMigrationEstimateProgress(['estimate'], ['alice.eth', 'bob.eth']),
      )
      let report = async (_names: readonly string[]) => {}
      act(() => {
        const observer = result.current.start(
          new AbortController().signal,
        ).onProgress
        report = async (names) => {
          await observer({ stage, names })
        }
      })
      await act(() => report(['alice.eth']))
      expect(result.current.progress).toEqual({
        stage,
        percentage,
      })
    },
  )

  it('resets for a different selection or wallet and ignores cancelled progress', async () => {
    const controller = new AbortController()
    const { result, rerender } = renderHook(
      ({ owner, selectedNames }) =>
        useMigrationEstimateProgress(
          ['estimate', { owner, selectedNames }],
          selectedNames,
        ),
      {
        initialProps: {
          owner: 'wallet-a',
          selectedNames: ['alice.eth', 'bob.eth'],
        },
      },
    )
    let report = async (_names: readonly string[]) => {}
    act(() => {
      const observer = result.current.start(controller.signal).onProgress
      report = async (names) => {
        await observer({ stage: 'preparing-upgrade', names })
      }
    })
    await act(() => report(['alice.eth']))
    expect(result.current.progress).toEqual({
      stage: 'preparing-upgrade',
      percentage: 58,
    })

    rerender({ owner: 'wallet-a', selectedNames: ['alice.eth'] })
    expect(result.current.progress).toBeUndefined()
    controller.abort()
    await act(async () => {
      await expect(report(['alice.eth', 'bob.eth'])).rejects.toBe(
        controller.signal.reason,
      )
    })
    expect(result.current.progress).toBeUndefined()
    rerender({ owner: 'wallet-b', selectedNames: ['alice.eth', 'bob.eth'] })
    expect(result.current.progress).toBeUndefined()
  })

  it('resets progress when the same query is retried', async () => {
    const { result } = renderHook(() =>
      useMigrationEstimateProgress(['estimate'], ['alice.eth']),
    )
    let report = async (_names: readonly string[]) => {}
    act(() => {
      const observer = result.current.start(
        new AbortController().signal,
      ).onProgress
      report = async (names) => {
        await observer({ stage: 'preparing-upgrade', names })
      }
    })
    await act(() => report(['alice.eth']))
    expect(result.current.progress?.percentage).toBe(66)
    act(() => {
      result.current.start(new AbortController().signal)
    })
    expect(result.current.progress?.percentage).toBe(0)
  })

  it('keeps one forward-only percentage across stages and late callbacks', async () => {
    const { result } = renderHook(() =>
      useMigrationEstimateProgress(['estimate'], ['alice.eth', 'bob.eth']),
    )
    let report = async (
      _stage:
        | 'checking-names'
        | 'finding-records'
        | 'preparing-upgrade'
        | 'checking-fee',
      _names: readonly string[],
    ) => {}
    act(() => {
      const handler = result.current.start(
        new AbortController().signal,
      ).onProgress
      report = async (stage, names) => {
        await handler({ stage, names })
      }
    })
    await act(() => report('checking-names', ['alice.eth', 'bob.eth']))
    expect(result.current.progress?.percentage).toBe(16)
    await act(() => report('finding-records', []))
    expect(result.current.progress?.percentage).toBe(16)
    await act(() => report('preparing-upgrade', ['alice.eth']))
    await act(() => report('checking-names', ['alice.eth', 'bob.eth']))
    expect(result.current.progress).toEqual({
      stage: 'preparing-upgrade',
      percentage: 58,
    })
    await act(() => report('checking-fee', ['alice.eth', 'bob.eth']))
    expect(result.current.progress?.percentage).toBe(99)
  })

  it('ignores an old observer after a retry starts', async () => {
    const { result } = renderHook(() =>
      useMigrationEstimateProgress(['estimate'], ['alice.eth', 'bob.eth']),
    )
    let reportOld = async () => {}
    let reportCurrent = async () => {}
    act(() => {
      const handler = result.current.start(
        new AbortController().signal,
      ).onProgress
      reportOld = async () => {
        await handler({
          stage: 'checking-fee',
          names: ['alice.eth', 'bob.eth'],
        })
      }
    })
    act(() => {
      const handler = result.current.start(
        new AbortController().signal,
      ).onProgress
      reportCurrent = async () => {
        await handler({ stage: 'checking-names', names: ['alice.eth'] })
      }
    })
    await act(reportCurrent)
    await act(reportOld)
    expect(result.current.progress).toEqual({
      stage: 'checking-names',
      percentage: 8,
    })
  })

  it('preserves progress when a network request retries within the same query', async () => {
    const signal = new AbortController().signal
    const { result } = renderHook(() =>
      useMigrationEstimateProgress(['estimate'], ['alice.eth', 'bob.eth']),
    )
    let report = async () => {}
    act(() => {
      const handler = result.current.start(signal).onProgress
      report = async () => {
        await handler({ stage: 'preparing-upgrade', names: ['alice.eth'] })
      }
    })
    await act(report)
    act(() => {
      const handler = result.current.start(signal).onProgress
      report = async () => {
        await handler({ stage: 'checking-names', names: ['alice.eth'] })
      }
    })
    expect(result.current.progress?.percentage).toBe(58)
    await act(report)
    expect(result.current.progress).toEqual({
      stage: 'preparing-upgrade',
      percentage: 58,
    })
  })

  it('propagates cancellation during a UI yield so the planner stops', async () => {
    const controller = new AbortController()
    const { result } = renderHook(() =>
      useMigrationEstimateProgress(['estimate'], ['alice.eth']),
    )
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    try {
      let report = async (_names: readonly string[]) => {}
      act(() => {
        const observer = result.current.start(controller.signal).onProgress
        report = async (names) => {
          await observer({ stage: 'preparing-upgrade', names })
        }
      })
      now.mockReturnValue(40)
      let pending = Promise.resolve()
      act(() => {
        pending = report(['alice.eth'])
      })
      controller.abort()
      await act(async () => {
        await expect(pending).rejects.toBe(controller.signal.reason)
      })
    } finally {
      now.mockRestore()
    }
  })
})
