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
import { handleQueue, stagingEquivalent } from './index.js'
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

describe('stagingEquivalent', () => {
  it('resolves a PR-build queue name to its production queue', () => {
    expect(stagingEquivalent('app-api-worker-pr-123-telegram-delivery')).toBe(
      'app-api-worker-telegram-delivery',
    )
    expect(stagingEquivalent('app-api-worker-pr-7-dlq')).toBe(
      'app-api-worker-dlq',
    )
  })

  it('resolves an isolated-staging queue name to its production queue', () => {
    expect(stagingEquivalent('app-api-worker-staging-email-delivery')).toBe(
      'app-api-worker-email-delivery',
    )
  })

  it('returns undefined for a name that is not a staging copy', () => {
    expect(
      stagingEquivalent('app-api-worker-telegram-delivery'),
    ).toBeUndefined()
    expect(stagingEquivalent('some-other-queue')).toBeUndefined()
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

  it('routes each delivery + dlq queue to its own handler', async () => {
    await handleQueue(batch('app-api-worker-email-delivery'), env)
    expect(handleEmailQueue).toHaveBeenCalledTimes(1)
    expect(handleTelegramQueue).not.toHaveBeenCalled()

    await handleQueue(batch('app-api-worker-telegram-delivery'), env)
    expect(handleTelegramQueue).toHaveBeenCalledTimes(1)

    await handleQueue(batch('app-api-worker-push-delivery'), env)
    expect(handlePushQueue).toHaveBeenCalledTimes(1)

    await handleQueue(batch('app-api-worker-dlq'), env)
    expect(handleDlqQueue).toHaveBeenCalledTimes(1)
    expect(handleEmailQueue).toHaveBeenCalledTimes(1)
  })

  it('routes staging and PR-build queues to the same handlers as production', async () => {
    await handleQueue(batch('app-api-worker-pr-42-telegram-delivery'), env)
    expect(handleTelegramQueue).toHaveBeenCalledTimes(1)

    await handleQueue(batch('app-api-worker-staging-event-ingestion'), env)
    expect(handleEventIngestionQueue).toHaveBeenCalledTimes(1)
  })

  it('throws on an unknown queue instead of dropping the batch', async () => {
    await expect(handleQueue(batch('some-other-queue'), env)).rejects.toThrow(
      /Unhandled queue/,
    )
    await expect(
      handleQueue(batch('app-api-worker-pr-9-does-not-exist'), env),
    ).rejects.toThrow(/Unhandled queue/)
  })
})
