import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import { runQueue } from '#test-utils/queue.js'

const consumers = vi.hoisted(() => ({
  telegram: vi.fn(),
  email: vi.fn(),
  push: vi.fn(),
  ingestion: vi.fn(),
  dlq: vi.fn(),
}))

vi.mock('./telegram.js', () => ({ handleTelegramQueue: consumers.telegram }))
vi.mock('./email.js', () => ({ handleEmailQueue: consumers.email }))
vi.mock('./push.js', () => ({ handlePushQueue: consumers.push }))
vi.mock('./event-ingestion.js', () => ({
  handleEventIngestionQueue: consumers.ingestion,
}))
vi.mock('./dlq.js', () => ({ handleDlqQueue: consumers.dlq }))

beforeEach(() => {
  vi.clearAllMocks()
  for (const consumer of Object.values(consumers)) {
    consumer.mockImplementation(async (batch: MessageBatch) => {
      for (const message of batch.messages) message.ack()
    })
  }
})

describe.each(['sepolia', 'mainnet'])('%s queue routing', (chain) => {
  const prefix =
    chain === 'mainnet' ? 'app-api-worker-mainnet' : 'app-api-worker'
  const env = { ...makeMockEnv(), CHAIN: chain } as CloudflareBindings

  it.each([
    ['telegram-delivery', 'telegram'],
    ['email-delivery', 'email'],
    ['push-delivery', 'push'],
    ['event-ingestion', 'ingestion'],
    ['dlq', 'dlq'],
  ] as const)('routes %s through the worker to its consumer', async (suffix, consumer) => {
    const result = await runQueue(`${prefix}-${suffix}`, [{ id: 'job' }], env)
    expect(consumers[consumer]).toHaveBeenCalledOnce()
    expect(
      Object.values(consumers).filter((handler) => handler.mock.calls.length),
    ).toHaveLength(1)
    expect(result.explicitAcks).toEqual(['message-0'])
    expect(result.retryMessages).toEqual([])
  })

  it('does not route the other environment’s queue', async () => {
    const other =
      chain === 'mainnet' ? 'app-api-worker' : 'app-api-worker-mainnet'
    await runQueue(`${other}-email-delivery`, [], env)
    for (const consumer of Object.values(consumers)) {
      expect(consumer).not.toHaveBeenCalled()
    }
  })
})
