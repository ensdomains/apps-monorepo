import { fromPromise } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import { makeQueueBatch, makeQueueMessage } from '#test-utils/queue.js'
import type { ExpiryEvent } from '#types/events/index.js'

vi.mock('#core/database/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('#core/database/index.js')
  >('#core/database/index.js')

  return {
    ...actual,
    getDatabase: vi.fn(),
    intoDbResult: <T>(promise: PromiseLike<T>) =>
      fromPromise(Promise.resolve(promise), (error) => error as Error),
  }
})

import { getDatabase, TABLE } from '#core/database/index.js'
import {
  buildIdempotencyKey,
  DATABASE_WRITE_BATCH_SIZE,
  handleEventIngestionQueue,
  QUEUE_BATCH_SIZE,
  RECIPIENT_PAGE_SIZE,
  shouldCreateExternalDeliveries,
} from './event-ingestion.js'

const mockGetDatabase = vi.mocked(getDatabase)

type FavoriteRow = { readonly user_id: string }
type UserRow = { readonly id: string; readonly address: string }
type ChannelRow = {
  readonly user_id: string
  readonly channel: 'email' | 'push' | 'telegram'
  readonly target: string | null
  readonly data?: unknown
}
type SettingsRow = {
  readonly user_id: string
  readonly owned_name_expiry: boolean
  readonly favourited_name_expiry: boolean
}
type NotificationRow = {
  readonly id: string
  readonly user_id: string
  readonly kind: 'name-expiry'
  readonly payload: unknown
  readonly idempotency_key: string
}
type DeliveryRow = {
  readonly id: string
  readonly notification_id: string
  readonly channel: 'email' | 'push' | 'telegram'
  readonly target: string
  status: 'queued' | 'delivered' | 'failed' | 'permanently_failed'
}
type NotificationInsert = Omit<NotificationRow, 'id'>
type DeliveryInsert = {
  readonly notification_id: string
  readonly channel: DeliveryRow['channel']
  readonly target: string
  readonly status: DeliveryRow['status']
}

class LazyQuery<T> implements PromiseLike<T> {
  readonly #run: () => T | PromiseLike<T>

  constructor(run: () => T | PromiseLike<T>) {
    this.#run = run
  }

  // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable, so this focused mock must be awaitable too.
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve().then(this.#run).then(onfulfilled, onrejected)
  }
}

type EventDbOptions = {
  readonly users?: readonly UserRow[]
  readonly favoritePageResults?: readonly (readonly FavoriteRow[] | Error)[]
  readonly channels?: readonly ChannelRow[]
  readonly settings?: readonly SettingsRow[]
  readonly failDeliveryInsertCount?: number
}

const makeEventDb = (options: EventDbOptions = {}) => {
  const notificationRows: NotificationRow[] = []
  const deliveryRows: DeliveryRow[] = []
  const notificationWriteBatches: unknown[][] = []
  const deliveryWriteBatches: unknown[][] = []
  const favoritePageResults = [...(options.favoritePageResults ?? [])]
  let pendingNotificationKeys: readonly string[] = []
  let remainingDeliveryInsertFailures = options.failDeliveryInsertCount ?? 0

  const notificationsFindMany = vi.fn(
    () =>
      new LazyQuery(() =>
        notificationRows.filter((notification) =>
          pendingNotificationKeys.includes(notification.idempotency_key),
        ),
      ),
  )
  const favoritesFindMany = vi.fn(async () => {
    const nextPage = favoritePageResults.shift() ?? []
    if (nextPage instanceof Error) {
      throw nextPage
    }
    return nextPage
  })

  const db = {
    query: {
      users: {
        findMany: vi.fn(async () => options.users ?? []),
      },
      favorites: {
        findMany: favoritesFindMany,
      },
      notifications: {
        findMany: notificationsFindMany,
      },
      userChannels: {
        findMany: vi.fn(() => new LazyQuery(() => options.channels ?? [])),
      },
      userNotificationSettings: {
        findMany: vi.fn(() => new LazyQuery(() => options.settings ?? [])),
      },
      notificationDeliveries: {
        findMany: vi.fn(() => new LazyQuery(() => deliveryRows)),
      },
    },
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const rows = Array.isArray(values) ? values : [values]

        if (table === TABLE.notifications) {
          notificationWriteBatches.push(rows)
          const notificationInserts = rows as readonly NotificationInsert[]
          pendingNotificationKeys = notificationInserts.map(
            (notification) => notification.idempotency_key,
          )
          const query = new LazyQuery(() => {
            for (const notification of notificationInserts) {
              const exists = notificationRows.some(
                (row) => row.idempotency_key === notification.idempotency_key,
              )
              if (!exists) {
                notificationRows.push({
                  ...notification,
                  id: `notification-${notificationRows.length + 1}`,
                })
              }
            }
            return []
          })
          return {
            onConflictDoNothing: vi.fn(() => query),
          }
        }

        deliveryWriteBatches.push(rows)
        const deliveryInserts = rows as readonly DeliveryInsert[]
        const query = new LazyQuery(() => {
          if (remainingDeliveryInsertFailures > 0) {
            remainingDeliveryInsertFailures -= 1
            throw new Error('delivery insert failed')
          }

          for (const delivery of deliveryInserts) {
            const exists = deliveryRows.some(
              (row) =>
                row.notification_id === delivery.notification_id &&
                row.channel === delivery.channel &&
                row.target === delivery.target,
            )
            if (!exists) {
              deliveryRows.push({
                ...delivery,
                id: `delivery-${deliveryRows.length + 1}`,
              })
            }
          }
          return []
        })
        return {
          onConflictDoNothing: vi.fn(() => query),
        }
      }),
    })),
    batch: vi.fn(async (queries: readonly PromiseLike<unknown>[]) => {
      const results: unknown[] = []
      for (const query of queries) {
        results.push(await query)
      }
      return results
    }),
  }

  return {
    db,
    notificationRows,
    deliveryRows,
    notificationWriteBatches,
    deliveryWriteBatches,
    favoritesFindMany,
  }
}

const expiryEvent = (overrides: Partial<ExpiryEvent> = {}): ExpiryEvent => ({
  type: 'name_expiring',
  name: 'alpha.eth',
  expiryDate: 1_700_000_000,
  stage: '7d',
  owner: '0xabc',
  includeFavorites: false,
  ...overrides,
})

const makeEmailQueue = () => ({
  send: vi.fn(async () => undefined),
  sendBatch: vi.fn(
    async (_messages: readonly { body: unknown }[]) => undefined,
  ),
})

describe('event-ingestion helpers', () => {
  it('builds deterministic idempotency keys', () => {
    expect(buildIdempotencyKey(expiryEvent(), 'user-1')).toBe(
      'name-expiry:user-1:alpha.eth:7d:1700000000',
    )
  })

  it('evaluates delivery settings by watch reason', () => {
    expect(
      shouldCreateExternalDeliveries('owned', {
        owned_name_expiry: true,
        favourited_name_expiry: false,
      }),
    ).toBe(true)
    expect(
      shouldCreateExternalDeliveries('favourited', {
        owned_name_expiry: true,
        favourited_name_expiry: false,
      }),
    ).toBe(false)
  })
})

describe('handleEventIngestionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('acks malformed and unsupported messages without retrying them', async () => {
    const malformed = makeQueueMessage({
      type: 'name_expiring',
      name: 'missing-fields',
    })
    const unsupported = makeQueueMessage({ type: 'name_registered' })
    const fixture = makeEventDb()
    mockGetDatabase.mockReturnValue(fixture.db as never)

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [malformed, unsupported]),
      makeMockEnv(),
    )

    expect(mockGetDatabase).toHaveBeenCalledOnce()
    expect(malformed.ack).toHaveBeenCalledOnce()
    expect(malformed.retry).not.toHaveBeenCalled()
    expect(unsupported.ack).toHaveBeenCalledOnce()
    expect(unsupported.retry).not.toHaveBeenCalled()
  })

  it('pages favourite recipients and bounds notification writes', async () => {
    const favorites = Array.from(
      { length: RECIPIENT_PAGE_SIZE + 1 },
      (_, index) => ({ user_id: `user-${index.toString().padStart(4, '0')}` }),
    )
    const fixture = makeEventDb({
      favoritePageResults: [
        favorites.slice(0, RECIPIENT_PAGE_SIZE),
        favorites.slice(RECIPIENT_PAGE_SIZE),
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const message = makeQueueMessage(
      expiryEvent({ owner: undefined, includeFavorites: true }),
    )

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [message]),
      makeMockEnv(),
    )

    expect(fixture.favoritesFindMany).toHaveBeenCalledTimes(2)
    expect(
      fixture.notificationWriteBatches.map((batch) => batch.length),
    ).toEqual([RECIPIENT_PAGE_SIZE, 1])
    expect(
      fixture.notificationWriteBatches.every(
        (batch) => batch.length <= DATABASE_WRITE_BATCH_SIZE,
      ),
    ).toBe(true)
    expect(fixture.notificationRows).toHaveLength(RECIPIENT_PAGE_SIZE + 1)
    expect(mockGetDatabase).toHaveBeenCalledOnce()
    expect(message.ack).toHaveBeenCalledOnce()
  })

  it('keeps owner semantics when the owner also favourited the name', async () => {
    const fixture = makeEventDb({
      users: [{ id: 'user-owner', address: '0xabc' }],
      favoritePageResults: [[{ user_id: 'user-owner' }]],
      channels: [
        {
          user_id: 'user-owner',
          channel: 'email',
          target: 'owner@example.com',
        },
      ],
      settings: [
        {
          user_id: 'user-owner',
          owned_name_expiry: true,
          favourited_name_expiry: false,
        },
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const emailQueue = makeEmailQueue()
    const message = makeQueueMessage(expiryEvent({ includeFavorites: true }))

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [message]),
      makeMockEnv({ EMAIL_QUEUE: emailQueue as unknown as Queue }),
    )

    expect(fixture.notificationRows).toHaveLength(1)
    expect(fixture.notificationRows[0]?.payload).toMatchObject({
      isOwner: true,
      watchReason: 'owned',
    })
    expect(fixture.deliveryRows).toHaveLength(1)
    expect(emailQueue.sendBatch).toHaveBeenCalledOnce()
  })

  it('excludes expired push subscriptions from delivery fanout', async () => {
    const fixture = makeEventDb({
      users: [{ id: 'user-1', address: '0xabc' }],
      channels: [
        {
          user_id: 'user-1',
          channel: 'push',
          target: 'https://push.example/expired',
          data: { expirationTime: Date.now() - 60_000 },
        },
        {
          user_id: 'user-1',
          channel: 'push',
          target: 'https://push.example/active',
          data: { expirationTime: Date.now() + 60_000 },
        },
      ],
      settings: [
        {
          user_id: 'user-1',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const pushQueue = makeEmailQueue()

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [makeQueueMessage(expiryEvent())]),
      makeMockEnv({ PUSH_QUEUE: pushQueue as unknown as Queue }),
    )

    expect(fixture.deliveryRows).toHaveLength(1)
    expect(fixture.deliveryRows[0]?.target).toBe('https://push.example/active')
    expect(pushQueue.sendBatch).toHaveBeenCalledOnce()
  })

  it('recovers an existing notification after delivery creation failed', async () => {
    const fixture = makeEventDb({
      users: [{ id: 'user-1', address: '0xabc' }],
      channels: [
        { user_id: 'user-1', channel: 'email', target: 'user@example.com' },
      ],
      settings: [
        {
          user_id: 'user-1',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
      failDeliveryInsertCount: 1,
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const emailQueue = makeEmailQueue()
    const env = makeMockEnv({
      EMAIL_QUEUE: emailQueue as unknown as Queue,
    })
    const firstMessage = makeQueueMessage(expiryEvent())

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [firstMessage]),
      env,
    )

    expect(firstMessage.retry).toHaveBeenCalledOnce()
    expect(fixture.notificationRows).toHaveLength(1)
    expect(fixture.deliveryRows).toHaveLength(0)

    const retryMessage = makeQueueMessage(expiryEvent())
    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [retryMessage]),
      env,
    )

    expect(retryMessage.ack).toHaveBeenCalledOnce()
    expect(fixture.notificationRows).toHaveLength(1)
    expect(fixture.deliveryRows).toHaveLength(1)
    expect(emailQueue.sendBatch).toHaveBeenCalledOnce()
  })

  it('isolates source failures and recovers in a different batch shape', async () => {
    const fixture = makeEventDb({
      users: [
        { id: 'user-a', address: '0xaaa' },
        { id: 'user-b', address: '0xbbb' },
      ],
      channels: [
        { user_id: 'user-a', channel: 'email', target: 'a@example.com' },
      ],
      settings: [
        {
          user_id: 'user-a',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
        {
          user_id: 'user-b',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
      failDeliveryInsertCount: 1,
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const first = makeQueueMessage(
      expiryEvent({ name: 'first.eth', owner: '0xaaa' }),
    )
    const sibling = makeQueueMessage(
      expiryEvent({ name: 'sibling.eth', owner: '0xbbb' }),
    )
    const emailQueue = makeEmailQueue()
    const env = makeMockEnv({ EMAIL_QUEUE: emailQueue as unknown as Queue })

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [first, sibling]),
      env,
    )

    expect(first.retry).toHaveBeenCalledOnce()
    expect(first.ack).not.toHaveBeenCalled()
    expect(sibling.ack).toHaveBeenCalledOnce()
    expect(sibling.retry).not.toHaveBeenCalled()
    expect(mockGetDatabase).toHaveBeenCalledOnce()
    expect(fixture.db.query.users.findMany).toHaveBeenCalledOnce()

    const retryAlone = makeQueueMessage(
      expiryEvent({ name: 'first.eth', owner: '0xaaa' }),
    )
    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [retryAlone]),
      env,
    )

    expect(retryAlone.ack).toHaveBeenCalledOnce()
    expect(fixture.notificationRows).toHaveLength(2)
    expect(fixture.deliveryRows).toHaveLength(1)
  })

  it('bounds large delivery inserts and queue sends', async () => {
    const channelCount = DATABASE_WRITE_BATCH_SIZE + 1
    const fixture = makeEventDb({
      users: [{ id: 'user-1', address: '0xabc' }],
      channels: Array.from({ length: channelCount }, (_, index) => ({
        user_id: 'user-1',
        channel: 'email' as const,
        target: `user-${index}@example.com`,
      })),
      settings: [
        {
          user_id: 'user-1',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const emailQueue = makeEmailQueue()
    const message = makeQueueMessage(expiryEvent())

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [message]),
      makeMockEnv({ EMAIL_QUEUE: emailQueue as unknown as Queue }),
    )

    expect(fixture.deliveryWriteBatches.map((batch) => batch.length)).toEqual([
      DATABASE_WRITE_BATCH_SIZE,
      1,
    ])
    expect(fixture.deliveryRows).toHaveLength(channelCount)
    expect(emailQueue.sendBatch).toHaveBeenCalledTimes(
      Math.ceil(channelCount / QUEUE_BATCH_SIZE),
    )
    expect(
      emailQueue.sendBatch.mock.calls.every(
        ([jobs]) => jobs.length <= QUEUE_BATCH_SIZE,
      ),
    ).toBe(true)
  })

  it('does not duplicate deliveries or requeue terminal rows', async () => {
    const fixture = makeEventDb({
      users: [{ id: 'user-1', address: '0xabc' }],
      channels: [
        { user_id: 'user-1', channel: 'email', target: 'user@example.com' },
      ],
      settings: [
        {
          user_id: 'user-1',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const emailQueue = makeEmailQueue()
    const env = makeMockEnv({ EMAIL_QUEUE: emailQueue as unknown as Queue })

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [makeQueueMessage(expiryEvent())]),
      env,
    )
    const delivery = fixture.deliveryRows[0]
    expect(delivery).toBeDefined()
    if (delivery) delivery.status = 'delivered'

    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [makeQueueMessage(expiryEvent())]),
      env,
    )

    expect(fixture.notificationRows).toHaveLength(1)
    expect(fixture.deliveryRows).toHaveLength(1)
    expect(emailQueue.sendBatch).toHaveBeenCalledOnce()
  })

  it('retries queued delivery handoff after the delivery commit succeeded', async () => {
    vi.useFakeTimers()
    const fixture = makeEventDb({
      users: [{ id: 'user-1', address: '0xabc' }],
      channels: [
        { user_id: 'user-1', channel: 'email', target: 'user@example.com' },
      ],
      settings: [
        {
          user_id: 'user-1',
          owned_name_expiry: true,
          favourited_name_expiry: true,
        },
      ],
    })
    mockGetDatabase.mockReturnValue(fixture.db as never)
    const emailQueue = makeEmailQueue()
    emailQueue.sendBatch.mockRejectedValue(new Error('queue unavailable'))
    const env = makeMockEnv({ EMAIL_QUEUE: emailQueue as unknown as Queue })
    const firstMessage = makeQueueMessage(expiryEvent())

    const firstAttempt = handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [firstMessage]),
      env,
    )
    await vi.runAllTimersAsync()
    await firstAttempt

    expect(firstMessage.retry).toHaveBeenCalledOnce()
    expect(fixture.deliveryRows).toHaveLength(1)
    emailQueue.sendBatch.mockResolvedValue(undefined)

    const retryMessage = makeQueueMessage(expiryEvent())
    await handleEventIngestionQueue(
      makeQueueBatch('event-ingestion', [retryMessage]),
      env,
    )

    expect(retryMessage.ack).toHaveBeenCalledOnce()
    expect(fixture.deliveryRows).toHaveLength(1)
    expect(emailQueue.sendBatch).toHaveBeenCalledTimes(4)
  })
})
