import { vi } from 'vitest'

export function makeMockQueue<T = unknown>() {
  return {
    metrics: vi.fn(async () => ({ backlogCount: 0, backlogBytes: 0 })),
    send: vi.fn(async (_message: T) => ({
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    })),
    sendBatch: vi.fn(async (_messages: Array<{ body: T }>) => ({
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    })),
  }
}

export function makeMockEnv(
  overrides?: Partial<CloudflareBindings>,
): CloudflareBindings {
  const eventIngestionQueue = makeMockQueue()
  const telegramQueue = makeMockQueue()
  const emailQueue = makeMockQueue()
  const pushQueue = makeMockQueue()

  return {
    KV: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    } as unknown as KVNamespace,
    EVENT_INGESTION_QUEUE: eventIngestionQueue as unknown as Queue,
    TELEGRAM_QUEUE: telegramQueue as unknown as Queue,
    EMAIL_QUEUE: emailQueue as unknown as Queue,
    PUSH_QUEUE: pushQueue as unknown as Queue,
    // The deployed worker always sets this; config resolution requires it.
    CHAIN: 'sepolia',
    ENS_INDEXER_GRAPHQL_URL: 'https://graphql.ens.dev/',
    ...overrides,
  } as unknown as CloudflareBindings
}
