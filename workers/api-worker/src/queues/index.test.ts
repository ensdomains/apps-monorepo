import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./telegram.js', () => ({
  handleTelegramQueue: vi.fn(async () => undefined),
}))
vi.mock('./email.js', () => ({
  handleEmailQueue: vi.fn(async () => undefined),
}))
vi.mock('./push.js', () => ({
  handlePushQueue: vi.fn(async () => undefined),
}))
vi.mock('./event-ingestion.js', () => ({
  handleEventIngestionQueue: vi.fn(async () => undefined),
}))
vi.mock('./dlq.js', () => ({
  handleDlqQueue: vi.fn(async () => undefined),
}))

import { handleDlqQueue } from './dlq.js'
import { handleEmailQueue } from './email.js'
import { handleEventIngestionQueue } from './event-ingestion.js'
import { handleQueue, queueSuffix } from './index.js'
import { handlePushQueue } from './push.js'
import { handleTelegramQueue } from './telegram.js'

const env = {} as CloudflareBindings

function batch(queue: string): MessageBatch {
  return {
    queue,
    messages: [],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch
}

describe('queueSuffix', () => {
  it('strips the production worker prefix', () => {
    expect(queueSuffix('app-api-worker-telegram-delivery')).toBe(
      'telegram-delivery',
    )
    expect(queueSuffix('app-api-worker-dlq')).toBe('dlq')
  })

  it('strips a per-branch (pr-<N>) prefix to the same suffix', () => {
    expect(queueSuffix('app-api-worker-pr-123-telegram-delivery')).toBe(
      'telegram-delivery',
    )
    expect(queueSuffix('app-api-worker-pr-7-dlq')).toBe('dlq')
  })

  it('leaves a non-matching name unchanged', () => {
    expect(queueSuffix('some-other-queue')).toBe('some-other-queue')
  })
})

describe('handleQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes event-ingestion queue', async () => {
    await handleQueue(batch('app-api-worker-event-ingestion'), env)
    expect(handleEventIngestionQueue).toHaveBeenCalledTimes(1)
  })

  it('routes existing delivery + dlq queues', async () => {
    await handleQueue(batch('app-api-worker-email-delivery'), env)
    await handleQueue(batch('app-api-worker-telegram-delivery'), env)
    await handleQueue(batch('app-api-worker-push-delivery'), env)
    await handleQueue(batch('app-api-worker-dlq'), env)

    expect(handleEmailQueue).toHaveBeenCalledTimes(1)
    expect(handleTelegramQueue).toHaveBeenCalledTimes(1)
    expect(handlePushQueue).toHaveBeenCalledTimes(1)
    expect(handleDlqQueue).toHaveBeenCalledTimes(1)
  })

  it('routes per-branch (pr-<N>) queues to the same handler as production', async () => {
    await handleQueue(batch('app-api-worker-pr-42-telegram-delivery'), env)
    await handleQueue(batch('app-api-worker-pr-42-event-ingestion'), env)

    expect(handleTelegramQueue).toHaveBeenCalledTimes(1)
    expect(handleEventIngestionQueue).toHaveBeenCalledTimes(1)
  })

  it('throws on an unknown queue instead of dropping the batch', async () => {
    await expect(
      handleQueue(batch('app-api-worker-pr-9-does-not-exist'), env),
    ).rejects.toThrow(/Unhandled queue/)
  })
})
