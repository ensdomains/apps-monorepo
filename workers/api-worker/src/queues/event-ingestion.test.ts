import { beforeEach, expect, it, vi } from 'vitest'
import { getDatabase } from '#core/database/index.js'
import { makeMockEnv, makeMockQueue } from '#test-utils/env.js'
import { runQueue } from '#test-utils/queue.js'
import {
  buildIdempotencyKey,
  collapseExpiryEvents,
  shouldCreateExternalDeliveries,
} from './event-ingestion.js'

vi.mock('#core/database/index.js', async (original) => ({
  ...(await original<typeof import('#core/database/index.js')>()),
  getDatabase: vi.fn(),
}))

const event = {
  type: 'name_expiring',
  name: 'alpha.eth',
  expiryDate: 1700000000,
  stage: 'expiry-7d',
  owner: '0xabc',
  includeFavorites: false,
} as const
const notification = {
  id: 'persisted-notification',
  user_id: 'owner',
  kind: 'name-expiry',
  payload: { watchReason: 'owned' },
  idempotency_key: buildIdempotencyKey(event, 'owner'),
}
const channels = ['email', 'push', 'telegram'].map((channel) => ({
  id: `${channel}-channel`,
  user_id: 'owner',
  channel,
  target: `${channel}-target`,
  data: null,
}))
const deliveries = channels.map((channel) => ({
  id: `persisted-${channel.channel}`,
  notification_id: notification.id,
  channel_id: channel.id,
  channel: channel.channel,
  status: 'queued',
}))

// Fixed boundary responses; no SQL evaluation, state, conflict handling or
// thenables. Persistence is tested in event-ingestion.db.test.ts.
const controlledDb = () => ({
  query: {
    users: {
      findMany: vi.fn().mockResolvedValue([{ id: 'owner', address: '0xabc' }]),
    },
    favorites: { findMany: vi.fn().mockResolvedValue([]) },
    notifications: { findMany: vi.fn() },
    userChannels: { findMany: vi.fn() },
    userNotificationSettings: { findMany: vi.fn() },
    notificationDeliveries: { findMany: vi.fn().mockResolvedValue(deliveries) },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
  })),
  batch: vi
    .fn()
    .mockResolvedValueOnce([[], [notification]])
    .mockResolvedValueOnce([
      channels,
      [
        {
          user_id: 'owner',
          owned_name_expiry: true,
          favourited_name_expiry: false,
        },
      ],
    ]),
})

beforeEach(() => vi.clearAllMocks())

it('uses a stable identity and owner-specific external delivery preferences', () => {
  expect(buildIdempotencyKey(event, 'owner')).toBe(
    'name-expiry:owner:alpha.eth:expiry-7d:1700000000',
  )
  const settings = { owned_name_expiry: true, favourited_name_expiry: false }
  expect(shouldCreateExternalDeliveries('owned', settings)).toBe(true)
  expect(shouldCreateExternalDeliveries('favourited', settings)).toBe(false)
  expect(shouldCreateExternalDeliveries('manual', settings)).toBe(true)
})

it('selects the most advanced overlapping stage and merges routing data', () => {
  expect(
    collapseExpiryEvents([
      {
        ...event,
        stage: 'grace-start',
        owner: undefined,
        includeFavorites: false,
      },
      {
        ...event,
        stage: 'expiry-30d',
        owner: '0xowner',
        includeFavorites: true,
      },
    ]),
  ).toEqual([
    expect.objectContaining({
      stage: 'grace-start',
      owner: '0xowner',
      includeFavorites: true,
    }),
  ])
})

it('keeps a protocol known on only one of the merged events', () => {
  expect(
    collapseExpiryEvents([
      { ...event, stage: 'grace-start' },
      { ...event, stage: 'expiry-30d', protocol: 'v1' },
    ]),
  ).toEqual([expect.objectContaining({ stage: 'grace-start', protocol: 'v1' })])
})

it('stores the protocol on the notification payload', async () => {
  const db = controlledDb()
  vi.mocked(getDatabase).mockReturnValue(db as never)

  await runQueue(
    'app-api-worker-event-ingestion',
    [{ ...event, protocol: 'v1' }],
    makeMockEnv(),
  )

  const values = db.insert.mock.results[0]?.value.values
  expect(values).toHaveBeenCalledWith([
    expect.objectContaining({
      payload: expect.objectContaining({ protocol: 'v1' }),
    }),
  ])
})

it('processes overlapping messages once and ACKs every source message', async () => {
  const db = controlledDb()
  vi.mocked(getDatabase).mockReturnValue(db as never)
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [
      { ...event, stage: 'expiry-30d', owner: undefined },
      { ...event, stage: 'expiry-7d', includeFavorites: true },
    ],
    makeMockEnv(),
  )
  expect(result.explicitAcks).toEqual(['message-0', 'message-1'])
  expect(result.retryMessages).toEqual([])
  expect(db.insert).toHaveBeenCalledTimes(2)
})

it('reconciles persisted identities, emits all channel jobs, and ACKs the source', async () => {
  const db = controlledDb()
  vi.mocked(getDatabase).mockReturnValue(db as never)
  const queues = channels.map(() => makeMockQueue())
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [event],
    makeMockEnv({
      EMAIL_QUEUE: queues[0],
      PUSH_QUEUE: queues[1],
      TELEGRAM_QUEUE: queues[2],
    }),
  )
  expect(result.explicitAcks).toEqual(['message-0'])
  expect(result.retryMessages).toEqual([])
  for (const [index, queue] of queues.entries()) {
    expect(queue.sendBatch).toHaveBeenCalledWith([
      {
        body: {
          id: deliveries[index]?.id,
          notificationId: notification.id,
          userId: 'owner',
          kind: 'name-expiry',
        },
      },
    ])
  }
  expect(db.insert).toHaveBeenCalledTimes(2)
})

it('retries only the failing source event and ACKs its successful sibling', async () => {
  const db = controlledDb()
  db.query.favorites.findMany.mockRejectedValueOnce(
    new Error('database unavailable'),
  )
  vi.mocked(getDatabase).mockReturnValue(db as never)
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [
      {
        ...event,
        expiryDate: event.expiryDate - 1,
        owner: undefined,
        includeFavorites: true,
      },
      event,
    ],
    makeMockEnv(),
  )
  expect(result.explicitAcks).toEqual(['message-1'])
  expect(result.retryMessages).toEqual([{ msgId: 'message-0' }])
})

it('retries every source in a failing lifecycle group while ACKing an unrelated group', async () => {
  const db = controlledDb()
  db.query.favorites.findMany.mockRejectedValueOnce(
    new Error('database unavailable'),
  )
  vi.mocked(getDatabase).mockReturnValue(db as never)
  const alpha = {
    ...event,
    expiryDate: event.expiryDate - 1,
    owner: undefined,
    includeFavorites: true,
  }
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [
      { ...alpha, stage: 'expiry-30d' },
      { ...alpha, stage: 'grace-start' },
      event,
    ],
    makeMockEnv(),
  )
  expect(result.explicitAcks).toEqual(['message-2'])
  expect(result.retryMessages).toEqual([
    { msgId: 'message-0' },
    { msgId: 'message-1' },
  ])
})

it('ACKs malformed and unsupported messages without delivery work', async () => {
  const db = controlledDb()
  vi.mocked(getDatabase).mockReturnValue(db as never)
  const email = makeMockQueue()
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [null, { type: 'name_expiring' }, { type: 'name_registered' }],
    makeMockEnv({ EMAIL_QUEUE: email }),
  )
  expect(result.explicitAcks).toEqual(['message-0', 'message-1', 'message-2'])
  expect(result.retryMessages).toEqual([])
  expect(db.insert).not.toHaveBeenCalled()
  expect(email.sendBatch).not.toHaveBeenCalled()
})

it('retries the source when handoff of a reconciled delivery cannot complete', async () => {
  vi.mocked(getDatabase).mockReturnValue(controlledDb() as never)
  const email = makeMockQueue()
  email.sendBatch.mockRejectedValue(new Error('queue unavailable'))
  const result = await runQueue(
    'app-api-worker-event-ingestion',
    [event],
    makeMockEnv({ EMAIL_QUEUE: email }),
  )
  expect(result.explicitAcks).toEqual([])
  expect(result.retryMessages).toEqual([{ msgId: 'message-0' }])
})
