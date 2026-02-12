import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#services/expiry-discovery/index.js', () => ({
  runExpiryDiscoveryCron: vi.fn(),
}))

import { runExpiryDiscoveryCron } from '#services/expiry-discovery/index.js'
import { handleScheduled } from './index.js'

const mockRunExpiryDiscoveryCron = vi.mocked(runExpiryDiscoveryCron)

describe('handleScheduled', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('logs completion on success', async () => {
    mockRunExpiryDiscoveryCron.mockReturnValue(
      okAsync({ totalEnqueued: 10, failedStages: 0 }),
    )

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await handleScheduled(
      {
        cron: '0 */1 * * *',
        scheduledTime: new Date('2026-02-11T12:00:00Z').getTime(),
      } as ScheduledController,
      {} as CloudflareBindings,
      {} as ExecutionContext,
    )

    expect(logSpy).toHaveBeenCalledWith(
      'Scheduled expiry discovery completed',
      {
        totalEnqueued: 10,
        failedStages: 0,
      },
    )
  })

  it('logs errors and does not throw on failure', async () => {
    mockRunExpiryDiscoveryCron.mockReturnValue(
      errAsync(new Error('boom') as never),
    )

    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(
      handleScheduled(
        {
          cron: '0 */1 * * *',
          scheduledTime: new Date('2026-02-11T12:00:00Z').getTime(),
        } as ScheduledController,
        {} as CloudflareBindings,
        {} as ExecutionContext,
      ),
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalled()
  })

  it('surfaces partial failures in completion log payload', async () => {
    mockRunExpiryDiscoveryCron.mockReturnValue(
      okAsync({ totalEnqueued: 50, failedStages: 1 }),
    )

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await handleScheduled(
      {
        cron: '0 */1 * * *',
        scheduledTime: new Date('2026-02-11T12:00:00Z').getTime(),
      } as ScheduledController,
      {} as CloudflareBindings,
      {} as ExecutionContext,
    )

    expect(logSpy).toHaveBeenCalledWith(
      'Scheduled expiry discovery completed',
      {
        totalEnqueued: 50,
        failedStages: 1,
      },
    )
  })
})
