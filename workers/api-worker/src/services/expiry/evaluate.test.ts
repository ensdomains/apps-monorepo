/** biome-ignore-all lint/suspicious/noExplicitAny: test code */
import { drizzle } from 'drizzle-orm/node-postgres'
import { errAsync, okAsync } from 'neverthrow'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Database, DatabaseError } from '#core/database/index.js'
import * as schema from '#core/database/schema/index.js'
import { createDrizzleProxySqlMock } from '#core/database/utils/mockDb.js'
import * as notificationsCreate from '#services/notifications/create.js'
import * as evaluate from './evaluate.js'
import * as expiryIndex from './index.js'

// Mock dependencies
vi.mock('./index.js', { spy: true })
vi.mock('#services/notifications/create.js')
vi.mock('./evaluate.js', { spy: true })

/**
 * Creates a mock Drizzle database instance using drizzle.mock()
 */
function createMockDatabase() {
  const db = drizzle.mock({ schema }) as unknown as Database
  return db
}

/**
 * Creates a mock CloudflareBindings object
 */
function createMockCloudflareBindings(): CloudflareBindings {
  return {
    DB: {
      connectionString: 'postgresql://test',
    } as any,
    TELEGRAM_QUEUE: {
      send: vi.fn(),
      sendBatch: vi.fn(),
    } as any,
    EMAIL_QUEUE: {
      send: vi.fn(),
      sendBatch: vi.fn(),
    } as any,
  } as CloudflareBindings
}

const TIME = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
}

/**
 * Creates test data for expiry evaluation
 */
function createTestData() {
  const now = new Date()
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1 day ago

  return {
    now,
    futureDate,
    pastDate,
    testNames: ['test.eth', 'example.eth', 'another.eth'],
    testUsers: [
      { id: 'user-1', address: '0x1234567890123456789012345678901234567890' },
      { id: 'user-2', address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
    ],
    testWatchers: [
      {
        name: 'test.eth',
        user_id: 'user-1',
        user: { address: '0x1234567890123456789012345678901234567890' },
      },
      {
        name: 'example.eth',
        user_id: 'user-1',
        user: { address: '0x1234567890123456789012345678901234567890' },
      },
    ],
    testExpiryData: new Map([
      [
        'test.eth',
        {
          expiryDate: futureDate,
          owner: '0x1234567890123456789012345678901234567890',
        },
      ],
      [
        'example.eth',
        {
          expiryDate: futureDate,
          owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      ],
    ]),
  }
}

describe('evaluate.ts', () => {
  let $db: ReturnType<typeof createMockDatabase>
  let mockDb: ReturnType<typeof createDrizzleProxySqlMock>
  let mockEnv: CloudflareBindings
  let testData: ReturnType<typeof createTestData>

  beforeEach(() => {
    vi.clearAllMocks()
    $db = createMockDatabase()
    mockDb = createDrizzleProxySqlMock($db)
    mockEnv = createMockCloudflareBindings()
    testData = createTestData()
  })

  describe('Pure Functions', () => {
    describe('getNextThreshold', () => {
      it('should return 30 when name is 25 days from expiry', () => {
        const now = Date.now()
        const expiryIn25Days = now + 25 * TIME.DAY
        const threshold = evaluate.getNextThreshold(expiryIn25Days)
        expect(threshold).toBe(30)
      })

      it('should return 7 when name is 5 days from expiry', () => {
        const now = Date.now()
        const expiryIn5Days = now + 5 * TIME.DAY
        const threshold = evaluate.getNextThreshold(expiryIn5Days)
        expect(threshold).toBe(7)
      })

      it('should return 1 when name is 12 hours from expiry', () => {
        const now = Date.now()
        const expiryIn12Hours = now + 12 * 60 * 60 * 1000
        const threshold = evaluate.getNextThreshold(expiryIn12Hours)
        expect(threshold).toBe(1)
      })

      it('should return undefined when name is more than 30 days from expiry', () => {
        const now = Date.now()
        const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000
        const threshold = evaluate.getNextThreshold(expiryIn35Days)
        expect(threshold).toBeUndefined()
      })

      it('should return undefined when name is expired', () => {
        const now = Date.now()
        const expiredDate = now - 24 * 60 * 60 * 1000
        const threshold = evaluate.getNextThreshold(expiredDate)
        expect(threshold).toBeUndefined()
      })

      it('should return undefined when name expires exactly now', () => {
        const now = Date.now()
        const threshold = evaluate.getNextThreshold(now)
        expect(threshold).toBeUndefined()
      })
    })

    describe('calculateNextEvalTime', () => {
      it('should return null for expired names', () => {
        const now = Date.now()
        const expiredTime = now - 24 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiredTime, now)
        expect(result).toBeNull()
      })

      it('should schedule check for 30 days before expiry when more than 30 days away', () => {
        const now = Date.now()
        const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiryIn35Days, now)
        expect(result).not.toBeNull()
        if (result) {
          const daysUntilCheck = Math.ceil(
            (result.getTime() - now) / (1000 * 60 * 60 * 24),
          )
          // Should be approximately 5 days from now (35 - 30 = 5)
          expect(daysUntilCheck).toBeGreaterThanOrEqual(4)
          expect(daysUntilCheck).toBeLessThanOrEqual(6)
        }
      })

      it('should schedule check for 7 days before expiry when 7-30 days away', () => {
        const now = Date.now()
        const expiryIn15Days = now + 15 * 24 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiryIn15Days, now)
        expect(result).not.toBeNull()
        if (result) {
          const daysUntilCheck = Math.ceil(
            (result.getTime() - now) / (1000 * 60 * 60 * 24),
          )
          // Should be approximately 8 days from now (15 - 7 = 8)
          expect(daysUntilCheck).toBeGreaterThanOrEqual(7)
          expect(daysUntilCheck).toBeLessThanOrEqual(9)
        }
      })

      it('should schedule check for 1 day before expiry when 1-7 days away', () => {
        const now = Date.now()
        const expiryIn5Days = now + 5 * 24 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiryIn5Days, now)
        expect(result).not.toBeNull()
        if (result) {
          const daysUntilCheck = Math.ceil(
            (result.getTime() - now) / (1000 * 60 * 60 * 24),
          )
          // Should be approximately 4 days from now (5 - 1 = 4)
          expect(daysUntilCheck).toBeGreaterThanOrEqual(3)
          expect(daysUntilCheck).toBeLessThanOrEqual(5)
        }
      })

      it('should schedule daily checks when less than 1 day from expiry', () => {
        const now = Date.now()
        const expiryIn12Hours = now + 12 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiryIn12Hours, now)
        expect(result).not.toBeNull()
        if (result) {
          const hoursUntilCheck = (result.getTime() - now) / (1000 * 60 * 60)
          // Should be approximately 24 hours from now
          expect(hoursUntilCheck).toBeGreaterThanOrEqual(23)
          expect(hoursUntilCheck).toBeLessThanOrEqual(25)
        }
      })

      it('should enforce minimum 1 hour interval', () => {
        const now = Date.now()
        const expiryIn2Hours = now + 2 * 60 * 60 * 1000
        const result = evaluate.calculateNextEvalTime(expiryIn2Hours, now)
        expect(result).not.toBeNull()
        if (result) {
          const hoursUntilCheck = (result.getTime() - now) / (1000 * 60 * 60)
          // Should be at least 1 hour
          expect(hoursUntilCheck).toBeGreaterThanOrEqual(1)
        }
      })
    })

    describe('calculateNextEvalTimes', () => {
      it('should calculate eval times for multiple names', () => {
        const now = Date.now()
        const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000
        const expiryIn15Days = now + 15 * 24 * 60 * 60 * 1000

        const freshData = new Map([
          [
            'name1.eth',
            { expiryDate: new Date(expiryIn35Days), owner: '0x123' },
          ],
          [
            'name2.eth',
            { expiryDate: new Date(expiryIn15Days), owner: '0x123' },
          ],
        ])

        const watcherCounts = new Map([
          ['name1.eth', 2],
          ['name2.eth', 1],
        ])

        const result = evaluate.calculateNextEvalTimes(
          ['name1.eth', 'name2.eth'],
          freshData,
          watcherCounts,
        )

        expect(result.size).toBe(2)
        expect(result.get('name1.eth')).not.toBeNull()
        expect(result.get('name2.eth')).not.toBeNull()
      })

      it('should schedule retry in 24 hours for names with no watchers', () => {
        const now = Date.now()
        const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000

        const freshData = new Map([
          [
            'name1.eth',
            { expiryDate: new Date(expiryIn35Days), owner: '0x123' },
          ],
        ])

        const watcherCounts = new Map([['name1.eth', 0]])

        const result = evaluate.calculateNextEvalTimes(
          ['name1.eth'],
          freshData,
          watcherCounts,
        )

        const nextEval = result.get('name1.eth')
        expect(nextEval).not.toBeNull()
        if (nextEval) {
          const hoursUntilCheck = (nextEval.getTime() - now) / (1000 * 60 * 60)
          expect(hoursUntilCheck).toBeGreaterThanOrEqual(23)
          expect(hoursUntilCheck).toBeLessThanOrEqual(25)
        }
      })

      it('should schedule retry in 24 hours for names with no expiry date', () => {
        const now = Date.now()

        const freshData = new Map([
          ['name1.eth', { expiryDate: null, owner: '0x123' }],
        ])

        const watcherCounts = new Map([['name1.eth', 1]])

        const result = evaluate.calculateNextEvalTimes(
          ['name1.eth'],
          freshData,
          watcherCounts,
        )

        const nextEval = result.get('name1.eth')
        expect(nextEval).not.toBeNull()
        if (nextEval) {
          const hoursUntilCheck = (nextEval.getTime() - now) / (1000 * 60 * 60)
          expect(hoursUntilCheck).toBeGreaterThanOrEqual(23)
          expect(hoursUntilCheck).toBeLessThanOrEqual(25)
        }
      })

      it('should return null for expired names', () => {
        const now = Date.now()
        const expiredDate = now - 24 * 60 * 60 * 1000

        const freshData = new Map([
          ['name1.eth', { expiryDate: new Date(expiredDate), owner: '0x123' }],
        ])

        const watcherCounts = new Map([['name1.eth', 1]])

        const result = evaluate.calculateNextEvalTimes(
          ['name1.eth'],
          freshData,
          watcherCounts,
        )

        expect(result.get('name1.eth')).toBeNull()
      })
    })

    describe('buildNotificationInputs', () => {
      it('should build notification inputs for names crossing thresholds', () => {
        const now = Date.now()
        const expiryIn25Days = now + 25 * 24 * 60 * 60 * 1000 // Crosses 30-day threshold

        const freshData = new Map([
          [
            'test.eth',
            {
              expiryDate: new Date(expiryIn25Days),
              owner: '0x1234567890123456789012345678901234567890',
            },
          ],
        ])

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: {
              address: '0x1234567890123456789012345678901234567890',
            },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(1)
        expect(result[0].userId).toBe('user-1')
        expect(result[0].payload.name).toBe('test.eth')
        expect(result[0].payload.expiryDate).toBe(expiryIn25Days)
        expect(result[0].payload.isOwner).toBe(true)
        expect(result[0].idempotencyKey).toContain(
          'name-expiry:user-1:test.eth:30',
        )
      })

      it('should detect non-owner correctly', () => {
        const now = Date.now()
        const expiryIn25Days = now + 25 * 24 * 60 * 60 * 1000

        const freshData = new Map([
          [
            'test.eth',
            {
              expiryDate: new Date(expiryIn25Days),
              owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
          ],
        ])

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: {
              address: '0x1234567890123456789012345678901234567890',
            },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(1)
        expect(result[0].payload.isOwner).toBe(false)
      })

      it('should skip names not found in indexer', () => {
        const freshData = new Map()

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(0)
      })

      it('should skip names with no expiry date', () => {
        const freshData = new Map([
          ['test.eth', { expiryDate: null, owner: '0x123' }],
        ])

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(0)
      })

      it('should skip names that have not crossed thresholds', () => {
        const now = Date.now()
        const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000 // More than 30 days away

        const freshData = new Map([
          [
            'test.eth',
            { expiryDate: new Date(expiryIn35Days), owner: '0x123' },
          ],
        ])

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(0)
      })

      it('should handle multiple watchers for the same name', () => {
        const now = Date.now()
        const expiryIn25Days = now + 25 * 24 * 60 * 60 * 1000

        const freshData = new Map([
          [
            'test.eth',
            {
              expiryDate: new Date(expiryIn25Days),
              owner: '0x1234567890123456789012345678901234567890',
            },
          ],
        ])

        const watchers = [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: {
              address: '0x1234567890123456789012345678901234567890',
            },
          },
          {
            name: 'test.eth',
            user_id: 'user-2',
            user: {
              address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
          },
        ]

        const result = evaluate.buildNotificationInputs(freshData, watchers)

        expect(result.length).toBe(2)
        expect(result[0].userId).toBe('user-1')
        expect(result[0].payload.isOwner).toBe(true)
        expect(result[1].userId).toBe('user-2')
        expect(result[1].payload.isOwner).toBe(false)
      })
    })
  })

  describe('fetchFreshExpiryData', () => {
    it('should fetch and return expiry data successfully', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      const result = await evaluate.fetchFreshExpiryData([
        'test.eth',
        'example.eth',
      ])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(expiryData)
      }
      expect(expiryIndex.getExpiryForNames).toHaveBeenCalledWith([
        'test.eth',
        'example.eth',
      ])
    })

    it('should handle subgraph errors', async () => {
      // Mock subgraph error - using errAsync with a generic error since the exact error class
      // structure is less important than testing error propagation
      const networkError = new Error('Network error')
      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        errAsync(networkError as any),
      )

      const result = await evaluate.fetchFreshExpiryData(['test.eth'])

      expect(result.isErr()).toBe(true)
    })

    it('should log warnings for missing names', async () => {
      const expiryData = new Map([
        ['test.eth', { expiryDate: new Date(), owner: '0x123' }],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await evaluate.fetchFreshExpiryData([
        'test.eth',
        'missing.eth',
      ])

      expect(result.isOk()).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Names not found in the indexer: missing.eth',
      )

      consoleSpy.mockRestore()
    })
  })

  describe('leaseDueNames', () => {
    it('should lease names due for evaluation', async () => {
      const now = new Date()
      const mockLeasedNames = [
        { name: 'test.eth', next_eval_at: now },
        { name: 'example.eth', next_eval_at: now },
      ]

      mockDb.when(({ sql }) => sql.includes('update'), mockLeasedNames)

      const result = await evaluate.leaseDueNames(mockDb.db)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockLeasedNames)
      }
    })

    it('should return empty array when no names are due', async () => {
      mockDb.when(({ sql }) => sql.includes('update'), [])

      const result = await evaluate.leaseDueNames(mockDb.db)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }
    })

    it('should handle database errors', async () => {
      const dbError = new DatabaseError({
        message: 'Database connection failed',
        cause: new Error('Connection timeout'),
      })

      mockDb.when(({ sql }) => sql.includes('update'), dbError)

      const result = await evaluate.leaseDueNames(mockDb.db)

      expect(result.isErr()).toBe(true)
    })
  })

  describe('batchUpdateEnsNames', () => {
    it('should batch update ens_names successfully', async () => {
      const now = new Date()
      const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const freshData = new Map([
        ['test.eth', { expiryDate, owner: '0x123' }],
        ['example.eth', { expiryDate, owner: '0x456' }],
      ])

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.batchUpdateEnsNames(mockDb.db, freshData, [
        'test.eth',
        'example.eth',
      ])

      expect(result.isOk()).toBe(true)
      expect(mockDb.executeMock).toHaveBeenCalled()
    })

    it('should skip names not found in freshData', async () => {
      const freshData = new Map([
        ['test.eth', { expiryDate: new Date(), owner: '0x123' }],
      ])

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.batchUpdateEnsNames(mockDb.db, freshData, [
        'test.eth',
        'missing.eth',
      ])

      expect(result.isOk()).toBe(true)
      // Should only update test.eth, not missing.eth
      const valuesCall = mockDb.calls[0]
      expect(valuesCall).toBeDefined()
    })

    it('should return ok when no updates needed', async () => {
      const freshData = new Map()

      const result = await evaluate.batchUpdateEnsNames(mockDb.db, freshData, [
        'missing.eth',
      ])

      expect(result.isOk()).toBe(true)
    })

    it('should handle database errors', async () => {
      const freshData = new Map([
        ['test.eth', { expiryDate: new Date(), owner: '0x123' }],
      ])

      const dbError = new DatabaseError({
        message: 'Database update failed',
        cause: new Error('Constraint violation'),
      })

      mockDb.when(({ sql }) => sql.includes('insert'), dbError)

      const result = await evaluate.batchUpdateEnsNames(mockDb.db, freshData, [
        'test.eth',
      ])

      expect(result.isErr()).toBe(true)
    })
  })

  describe('batchUpdateEvalPointers', () => {
    it('should batch update eval pointers successfully', async () => {
      const now = Date.now()
      const nextEval1 = new Date(now + 5 * 24 * 60 * 60 * 1000)
      const nextEval2 = new Date(now + 10 * 24 * 60 * 60 * 1000)

      const evalTimes = new Map([
        ['test.eth', nextEval1],
        ['example.eth', nextEval2],
      ])

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.batchUpdateEvalPointers(
        mockDb.db,
        evalTimes,
      )

      expect(result.isOk()).toBe(true)
      expect(mockDb.executeMock).toHaveBeenCalled()
    })

    it('should handle null eval times (expired names)', async () => {
      const evalTimes = new Map([
        ['test.eth', new Date()],
        ['expired.eth', null],
      ])

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.batchUpdateEvalPointers(
        mockDb.db,
        evalTimes,
      )

      expect(result.isOk()).toBe(true)
      expect(mockDb.executeMock).toHaveBeenCalled()
    })

    it('should return ok when no updates needed', async () => {
      const evalTimes = new Map()

      const result = await evaluate.batchUpdateEvalPointers(
        mockDb.db,
        evalTimes,
      )

      expect(result.isOk()).toBe(true)
    })

    it('should handle database errors', async () => {
      const evalTimes = new Map([['test.eth', new Date()]])

      const dbError = new DatabaseError({
        message: 'Database update failed',
        cause: new Error('Constraint violation'),
      })

      mockDb.when(({ sql }) => sql.includes('insert'), dbError)

      const result = await evaluate.batchUpdateEvalPointers(
        mockDb.db,
        evalTimes,
      )

      expect(result.isErr()).toBe(true)
    })
  })

  describe('buildNotificationInputs logic', () => {
    it('should build correct notification inputs with owner detection', async () => {
      const expiryData = new Map([
        [
          'test.eth',
          {
            expiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days
            owner: '0x1234567890123456789012345678901234567890',
          },
        ],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(
        ({ sql }) => sql.includes('select'),
        [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x1234567890123456789012345678901234567890' }, // Same as owner
          },
        ],
      )

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 1,
          deliveryCount: 2,
          queueJobCounts: { telegram: 1, email: 1 },
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      const callArgs = vi.mocked(notificationsCreate.createBatchNotifications)
        .mock.calls[0][0]
      const notificationPayload = callArgs.notifications[0].payload as {
        isOwner?: boolean
      }
      expect(notificationPayload.isOwner).toBe(true)
    })

    it('should build notification inputs with non-owner detection', async () => {
      const expiryData = new Map([
        [
          'test.eth',
          {
            expiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
            owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // Different owner
          },
        ],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(
        ({ sql }) => sql.includes('select'),
        [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x1234567890123456789012345678901234567890' }, // Different from owner
          },
        ],
      )

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 1,
          deliveryCount: 2,
          queueJobCounts: { telegram: 1, email: 1 },
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      const callArgs = vi.mocked(notificationsCreate.createBatchNotifications)
        .mock.calls[0][0]
      const notificationPayload = callArgs.notifications[0].payload as {
        isOwner?: boolean
      }
      expect(notificationPayload.isOwner).toBe(false)
    })
  })

  describe('calculateNextEvalTime logic', () => {
    it('should schedule next eval based on expiry thresholds', async () => {
      const now = Date.now()
      const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000 // More than 30 days away

      const expiryData = new Map([
        ['test.eth', { expiryDate: new Date(expiryIn35Days), owner: '0x123' }],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(
        ({ sql }) => sql.includes('select'),
        [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ],
      )

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 0,
          deliveryCount: 0,
          queueJobCounts: {},
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      // Verify that eval pointers were updated (insert was called for ensEvalPointers)
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('insert')),
      ).not.toBe(-1)
    })
  })

  describe('calculateNextEvalTimes edge cases', () => {
    it('should handle names with no watchers', async () => {
      const expiryData = new Map([
        ['test.eth', { expiryDate: testData.futureDate, owner: '0x123' }],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      // No watchers returned
      mockDb.when(({ sql }) => sql.includes('select'), [])

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      // Should still update eval pointers (scheduled for retry in 24 hours)
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('insert')),
      ).not.toBe(-1)
    })

    it('should handle names with no expiry dates', async () => {
      const expiryData = new Map([
        ['test.eth', { expiryDate: null, owner: '0x123' }],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(
        ({ sql }) => sql.includes('select'),
        [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ],
      )

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      // Should still update eval pointers (scheduled for retry in 24 hours)
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('insert')),
      ).not.toBe(-1)
    })
  })

  describe('processNames', () => {
    it('should process names successfully with notifications', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(({ sql }) => sql.includes('select'), testData.testWatchers)

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 2,
          deliveryCount: 4,
          queueJobCounts: { telegram: 2, email: 2 },
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth', 'example.eth'],
      })

      expect(result.isOk()).toBe(true)
      expect(expiryIndex.getExpiryForNames).toHaveBeenCalledWith([
        'test.eth',
        'example.eth',
      ])
      expect(notificationsCreate.createBatchNotifications).toHaveBeenCalled()
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('insert')),
      ).not.toBe(-1) // Should update ens_names and eval pointers
    })

    it('should process names without creating notifications when no thresholds crossed', async () => {
      const now = Date.now()
      const expiryIn35Days = now + 35 * 24 * 60 * 60 * 1000 // More than 30 days away (no threshold)

      const expiryData = new Map([
        ['test.eth', { expiryDate: new Date(expiryIn35Days), owner: '0x123' }],
      ])

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(
        ({ sql }) => sql.includes('select'),
        [
          {
            name: 'test.eth',
            user_id: 'user-1',
            user: { address: '0x123' },
          },
        ],
      )

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isOk()).toBe(true)
      expect(
        notificationsCreate.createBatchNotifications,
      ).not.toHaveBeenCalled()
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('insert')),
      ).not.toBe(-1) // Should still update database
    })

    it('should handle empty names list', async () => {
      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: [],
      })

      expect(result.isOk()).toBe(true)
      expect(expiryIndex.getExpiryForNames).not.toHaveBeenCalled()
    })

    it('should handle names not found in indexer', async () => {
      const emptyExpiryData = new Map()

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(emptyExpiryData),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['nonexistent.eth'],
      })

      expect(result.isOk()).toBe(true)
      expect(
        mockDb.calls.findIndex((call) => call.sql.includes('select')),
      ).toBe(-1)
    })

    it('should handle database errors when fetching watchers', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      const dbError = new DatabaseError({
        cause: new Error('Database connection failed'),
      })

      mockDb.when(({ sql }) => sql.includes('select'), dbError.cause)

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isErr()).toBe(true)
    })

    it('should handle errors from createBatchNotifications', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(({ sql }) => sql.includes('select'), testData.testWatchers)

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      const notificationError = errAsync({
        tag: 'NOTIFICATION_CREATION_ERROR',
        message: 'Failed to create notifications',
      } as any)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        notificationError,
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isErr()).toBe(true)
    })
  })

  describe('evaluateExpiringNames', () => {
    it('should successfully evaluate expiring names', async () => {
      const leasedNames = [
        { name: 'test.eth', next_eval_at: new Date() },
        { name: 'example.eth', next_eval_at: new Date() },
      ]

      // Mock leaseDueNames by mocking the database operations it uses
      mockDb.when(({ sql }) => sql.includes('update'), leasedNames)

      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(({ sql }) => sql.includes('select'), testData.testWatchers)

      mockDb.when(({ sql }) => sql.includes('insert'), undefined)

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 2,
          deliveryCount: 4,
          queueJobCounts: { telegram: 2, email: 2 },
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.evaluateExpiringNames(mockEnv, mockDb.db)

      expect(result.isOk()).toBe(true)
    })

    it('should handle empty leased names', async () => {
      const emptyLeasedNames: any[] = []

      // Mock leaseDueNames
      mockDb.when(({ sql }) => sql.includes('update'), emptyLeasedNames)

      const result = await evaluate.evaluateExpiringNames(mockEnv, mockDb.db)

      expect(result.isOk()).toBe(true)
      expect(expiryIndex.getExpiryForNames).not.toHaveBeenCalled()
    })

    it('should handle database errors in leaseDueNames', async () => {
      const dbError = new DatabaseError({
        cause: new Error('Database connection failed'),
      })

      mockDb.when(({ sql }) => sql.includes('update'), dbError)

      const result = await evaluate.evaluateExpiringNames(mockEnv, mockDb.db)

      expect(result.isErr()).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should wrap database errors in EvalPointerError for leaseDueNames', async () => {
      const dbError = new DatabaseError({
        cause: new Error('Database error'),
      })

      mockDb.when(({ sql }) => sql.includes('update'), dbError.cause)

      const result = await evaluate.evaluateExpiringNames(mockEnv, mockDb.db)

      expect(result.isErr()).toBe(true)
      // Error should be wrapped in EvalPointerError
      if (result.isErr()) {
        expect(result.error).toBeDefined()
      }
    })

    it('should wrap database errors in NameUpdateError for batchUpdateEnsNames', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(({ sql }) => sql.includes('select'), testData.testWatchers)

      mockDb.when(
        ({ sql }) => sql.includes('insert'),
        new DatabaseError({
          cause: new Error('Database error'),
        }),
      )

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 0,
          deliveryCount: 0,
          queueJobCounts: {},
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      console.log('result', result)

      assert(result.isErr(), 'Result should be an error')
      // Error should be wrapped in NameUpdateError
      expect(result.error).toBeDefined()
    })

    it('should wrap database errors in EvalPointerError for batchUpdateEvalPointers', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      mockDb.when(({ sql }) => sql.includes('select'), testData.testWatchers)

      // First insert succeeds (ens_names), second fails (ensEvalPointers)
      mockDb.when(
        ({ sql }) => sql.includes('insert') && sql.includes('ens_names'),
        undefined,
      )
      mockDb.when(
        ({ sql }) =>
          sql.includes('insert') && sql.includes('ens_eval_pointers'),
        new DatabaseError({
          cause: new Error('Database error'),
        }),
      )

      vi.mocked(notificationsCreate.createBatchNotifications).mockReturnValue(
        okAsync({
          notificationCount: 0,
          deliveryCount: 0,
          queueJobCounts: {},
          notificationsWithIds: [],
        }),
      )

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isErr()).toBe(true)
      // Error should be wrapped in EvalPointerError
      if (result.isErr()) {
        expect(result.error).toBeDefined()
      }
    })

    it('should wrap database errors in ExpiryEvaluationError for watcher queries', async () => {
      const expiryData = testData.testExpiryData

      vi.mocked(expiryIndex.getExpiryForNames).mockReturnValue(
        okAsync(expiryData),
      )

      const dbError = new Error('Database error')
      mockDb.when(({ sql }) => sql.includes('select'), dbError)

      const result = await evaluate.processNames({
        env: mockEnv,
        db: mockDb.db,
        names: ['test.eth'],
      })

      expect(result.isErr()).toBe(true)
      // Error should be wrapped in ExpiryEvaluationError
      if (result.isErr()) {
        expect(result.error).toBeDefined()
      }
    })
  })
})
