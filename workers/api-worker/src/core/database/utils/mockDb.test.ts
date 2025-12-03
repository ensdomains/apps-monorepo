/** biome-ignore-all lint/suspicious/noExplicitAny: test code */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeEach, describe, expect, it } from 'vitest'
import { type Database, TABLE } from '#core/database/index.js'
import * as schema from '#core/database/schema/index.js'
import { createDrizzleProxySqlMock } from './mockDb.js'

/**
 * Creates a mock Drizzle database instance using drizzle.mock()
 */
function createMockDatabase() {
  const db = drizzle.mock({ schema }) as unknown as Database
  return db
}

describe('createDrizzleProxySqlMock', () => {
  let db: Database
  let mockApi: ReturnType<typeof createDrizzleProxySqlMock>

  beforeEach(() => {
    db = createMockDatabase()
    mockApi = createDrizzleProxySqlMock(db)
  })

  describe('basic functionality', () => {
    it('should return an API with db, when, calls, executeMock, and reset', () => {
      expect(mockApi).toBeDefined()
      expect(mockApi.db).toBeDefined()
      expect(mockApi.when).toBeDefined()
      expect(mockApi.calls).toBeDefined()
      expect(mockApi.executeMock).toBeDefined()
      expect(mockApi.reset).toBeDefined()
    })

    it('should have database methods available on proxied db', () => {
      expect(mockApi.db.select).toBeDefined()
      expect(mockApi.db.insert).toBeDefined()
      expect(mockApi.db.update).toBeDefined()
      expect(mockApi.db.delete).toBeDefined()
      expect(mockApi.db.with).toBeDefined()
      expect(mockApi.db.$with).toBeDefined()
    })
  })

  describe('when() - SQL string matching', () => {
    it('should match queries by SQL string pattern', async () => {
      const mockResult = [{ id: '1', name: 'test.eth' }]

      mockApi.when(({ sql }) => sql.includes('select'), mockResult)

      const query = mockApi.db
        .select()
        .from(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should match queries by specific SQL substring', async () => {
      const mockResult = [{ name: 'test.eth', expiry_at: new Date() }]

      mockApi.when(
        ({ sql }) => sql.includes('update') && sql.includes('ens_names'),
        mockResult,
      )

      const query = mockApi.db
        .update(TABLE.ensNames)
        .set({ expiry_at: new Date() })
        .where(eq(TABLE.ensNames.name, 'test.eth'))
        .returning({
          name: TABLE.ensNames.name,
          expiry_at: TABLE.ensNames.expiry_at,
        })

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should support multiple mock configurations', async () => {
      const selectResult = [{ id: '1' }]
      const updateResult = [{ name: 'test.eth' }]

      mockApi.when(({ sql }) => sql.includes('select'), selectResult)
      mockApi.when(({ sql }) => sql.includes('update'), updateResult)

      const selectQuery = mockApi.db.select().from(TABLE.ensNames)
      const selectRes = await selectQuery
      expect(selectRes).toEqual(selectResult)

      const updateQuery = mockApi.db
        .update(TABLE.ensNames)
        .set({ updated_at: new Date() })
        .returning({ name: TABLE.ensNames.name })
      const updateRes = await updateQuery
      expect(updateRes).toEqual(updateResult)
    })

    it('should use first matching mock when multiple match', async () => {
      const firstResult = [{ name: 'first' }]
      const secondResult = [{ name: 'second' }]

      mockApi.when(({ sql }) => sql.includes('select'), firstResult)
      mockApi.when(({ sql }) => sql.includes('select'), secondResult)

      const query = mockApi.db.select().from(TABLE.ensNames)
      const result = await query
      expect(result).toEqual(firstResult)
    })
  })

  describe('when() - regex matching', () => {
    it('should match queries by regex pattern', async () => {
      const mockResult = [{ id: '1', name: 'test.eth' }]

      mockApi.when(({ sql }) => /select.*ens_names/i.test(sql), mockResult)

      const query = mockApi.db
        .select()
        .from(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should match complex queries with regex', async () => {
      const mockResult = [{ name: 'test.eth' }]

      mockApi.when(
        ({ sql }) => /update.*ens_names.*WHERE/i.test(sql),
        mockResult,
      )

      const query = mockApi.db
        .update(TABLE.ensNames)
        .set({ updated_at: new Date() })
        .where(eq(TABLE.ensNames.name, 'test.eth'))
        .returning({ name: TABLE.ensNames.name })

      const result = await query
      expect(result).toEqual(mockResult)
    })
  })

  describe('when() - custom matcher functions', () => {
    it('should match queries using custom matcher function', async () => {
      const mockResult = [{ name: 'test.eth' }]

      mockApi.when(
        ({ sql }) => sql.includes('update') && sql.includes('ens_names'),
        mockResult,
      )

      const query = mockApi.db
        .update(TABLE.ensNames)
        .set({ updated_at: new Date() })
        .returning({ name: TABLE.ensNames.name })

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should support complex custom matcher logic', async () => {
      const mockResult = [{ id: '1' }]

      mockApi.when(({ sql }) => {
        const lowerSql = sql.toLowerCase()
        return (
          lowerSql.includes('select') &&
          lowerSql.includes('ens_names') &&
          lowerSql.includes('where')
        )
      }, mockResult)

      const query = mockApi.db
        .select()
        .from(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))

      const result = await query
      expect(result).toEqual(mockResult)
    })
  })

  describe('INSERT queries', () => {
    it('should mock INSERT queries', async () => {
      mockApi.when(({ sql }) => sql.includes('insert'), undefined)

      const query = mockApi.db.insert(TABLE.ensNames).values({
        name: 'test.eth',
        expiry_at: new Date(),
        last_checked_at: new Date(),
        updated_at: new Date(),
      })

      const result = await query
      expect(result).toBeUndefined()
    })

    it('should mock INSERT with returning clause', async () => {
      const mockResult = [{ name: 'test.eth' }]

      mockApi.when(
        ({ sql }) => sql.includes('insert') && sql.includes('returning'),
        mockResult,
      )

      const query = mockApi.db
        .insert(TABLE.ensNames)
        .values({
          name: 'test.eth',
          expiry_at: new Date(),
        })
        .returning({
          name: TABLE.ensNames.name,
        })

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should mock INSERT with ON CONFLICT DO UPDATE', async () => {
      mockApi.when(
        ({ sql }) => sql.includes('insert') && sql.includes('on conflict'),
        undefined,
      )

      const query = mockApi.db
        .insert(TABLE.ensNames)
        .values({
          name: 'test.eth',
          expiry_at: new Date(),
        })
        .onConflictDoUpdate({
          target: TABLE.ensNames.name,
          set: { updated_at: new Date() },
        })

      const result = await query
      expect(result).toBeUndefined()
    })
  })

  describe('UPDATE queries', () => {
    it('should mock UPDATE queries', async () => {
      const mockResult = [{ name: 'test.eth', updated_at: new Date() }]

      mockApi.when(({ sql }) => sql.includes('update'), mockResult)

      const query = mockApi.db
        .update(TABLE.ensNames)
        .set({ updated_at: new Date() })
        .where(eq(TABLE.ensNames.name, 'test.eth'))
        .returning({
          name: TABLE.ensNames.name,
          updated_at: TABLE.ensNames.updated_at,
        })

      const result = await query
      expect(result).toEqual(mockResult)
    })

    it('should mock UPDATE without returning', async () => {
      mockApi.when(
        ({ sql }) => sql.includes('update') && !sql.includes('RETURNING'),
        undefined,
      )

      const query = mockApi.db
        .update(TABLE.ensNames)
        .set({ updated_at: new Date() })
        .where(eq(TABLE.ensNames.name, 'test.eth'))

      const result = await query
      expect(result).toBeUndefined()
    })
  })

  describe('DELETE queries', () => {
    it('should mock DELETE queries', async () => {
      const mockResult = [{ name: 'test.eth' }]

      mockApi.when(({ sql }) => sql.includes('delete'), mockResult)

      const query = mockApi.db
        .delete(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))
        .returning({ name: TABLE.ensNames.name })

      const result = await query
      expect(result).toEqual(mockResult)
    })
  })

  describe('WITH/CTE queries', () => {
    it('should mock UPDATE queries with CTE (WITH clause)', async () => {
      const mockResult = [
        { name: 'test.eth', next_eval_at: new Date() },
        { name: 'example.eth', next_eval_at: new Date() },
      ]

      mockApi.when(
        ({ sql }) =>
          sql.includes('update') &&
          sql.includes('ens_eval_pointers') &&
          sql.includes('returning'),
        mockResult,
      )

      const dueQuery = mockApi.db
        .$with('due')
        .as(
          mockApi.db
            .select({ name: TABLE.ensEvalPointers.name })
            .from(TABLE.ensEvalPointers)
            .limit(10),
        )

      const query = mockApi.db
        .with(dueQuery)
        .update(TABLE.ensEvalPointers)
        .set({ updated_at: new Date() })
        .from(dueQuery)
        .where(eq(TABLE.ensEvalPointers.name, dueQuery.name))
        .returning({
          name: TABLE.ensEvalPointers.name,
          next_eval_at: TABLE.ensEvalPointers.next_eval_at,
        })

      const result = await query
      expect(result).toEqual(mockResult)
    })
  })

  describe('error handling', () => {
    it('should throw error when no mock is registered', async () => {
      const query = mockApi.db.select().from(TABLE.ensNames)

      await expect(query).rejects.toThrow('No mock registered for SQL')
    })

    it('should include SQL in error message', async () => {
      const query = mockApi.db.select().from(TABLE.ensNames)

      try {
        await query
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('No mock registered for SQL')
        expect(error.message).toContain('select')
      }
    })

    it('should list all registered mocks in error message', async () => {
      mockApi.when(({ sql }) => sql.includes('update '), [])
      mockApi.when(({ sql }) => sql.includes('delete '), [])

      const query = mockApi.db.select().from(TABLE.ensNames)

      try {
        await query
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('All mocks:')
      }
    })
  })

  describe('calls tracking', () => {
    it('should track SQL calls', async () => {
      const mockResult = [{ id: '1' }]
      mockApi.when(({ sql }) => sql.includes('select'), mockResult)

      const query = mockApi.db.select().from(TABLE.ensNames)
      await query

      expect(mockApi.calls.length).toBe(1)
      expect(mockApi.calls[0]).toBeDefined()
      expect(mockApi.calls[0].sql).toBeDefined()
      expect(mockApi.calls[0].sql).toContain('select')
    })

    it('should track multiple calls', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])
      mockApi.when(({ sql }) => sql.includes('update'), [])

      await mockApi.db.select().from(TABLE.ensNames)
      await mockApi.db.update(TABLE.ensNames).set({ updated_at: new Date() })

      expect(mockApi.calls.length).toBe(2)
      expect(mockApi.calls[0].sql).toContain('select')
      expect(mockApi.calls[1].sql).toContain('update')
    })

    it('should track calls with params', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])

      await mockApi.db
        .select()
        .from(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))

      expect(mockApi.calls.length).toBe(1)
      expect(mockApi.calls[0].params).toBeDefined()
    })
  })

  describe('reset()', () => {
    it('should clear all mocks', () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])
      mockApi.when(({ sql }) => sql.includes('update'), [])

      expect(mockApi.calls.length).toBe(0)

      mockApi.reset()

      // After reset, calling a query should fail
      const query = mockApi.db.select().from(TABLE.ensNames)
      expect(query).rejects.toThrow('No mock registered for SQL')
    })

    it('should clear calls array', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])

      await mockApi.db.select().from(TABLE.ensNames)
      expect(mockApi.calls.length).toBe(1)

      mockApi.reset()
      expect(mockApi.calls.length).toBe(0)
    })

    it('should reset executeMock', () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])

      mockApi.reset()

      expect(mockApi.executeMock.mockReset).toBeDefined()
    })
  })

  describe('executeMock', () => {
    it('should be a vitest mock function', () => {
      expect(mockApi.executeMock).toBeDefined()
      expect(typeof mockApi.executeMock).toBe('function')
    })

    it('should be callable and track calls', async () => {
      const mockResult = [{ id: '1' }]
      mockApi.when(({ sql }) => sql.includes('select'), mockResult)

      const query = mockApi.db.select().from(TABLE.ensNames)
      const result = await query

      expect(result).toEqual(mockResult)
      expect(mockApi.executeMock).toHaveBeenCalled()
    })
  })

  describe('query builder chain preservation', () => {
    it('should preserve query builder method chaining', () => {
      const query = mockApi.db
        .select()
        .from(TABLE.ensNames)
        .where(eq(TABLE.ensNames.name, 'test.eth'))
        .limit(10)

      expect(query).toBeDefined()
      expect(typeof query.then).toBe('function')
    })

    it('should preserve query metadata methods', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), [{ id: '1' }])

      const query = mockApi.db.select().from(TABLE.ensNames)

      const sql = query.toSQL()
      expect(sql).toBeDefined()
      expect(sql.sql).toBeDefined()

      const result = await query
      expect(result).toEqual([{ id: '1' }])
    })
  })

  describe('relational queries', () => {
    it('should handle relational query API (findMany)', async () => {
      const mockWatchers = [
        {
          name: 'test.eth',
          user_id: 'user-1',
          user: { address: '0x123' },
        },
      ]

      mockApi.when(
        ({ sql }) => sql.includes('ens_watchers') || sql.includes('select'),
        mockWatchers,
      )

      const watchers = await mockApi.db.query.ensWatchers.findMany({
        where: eq(TABLE.ensWatchers.name, 'test.eth'),
        with: {
          user: {
            columns: {
              address: true,
            },
          },
        },
      })

      expect(watchers).toEqual(mockWatchers)
    })

    it('should handle relational query API (findFirst)', async () => {
      const mockUser = {
        id: 'user-1',
        address: '0x123',
      }

      mockApi.when(
        ({ sql }) => sql.includes('users') && sql.includes('select'),
        mockUser,
      )

      const user = await mockApi.db.query.users.findFirst({
        where: eq(TABLE.users.address, '0x123'),
      })

      expect(user).toEqual(mockUser)
    })
  })

  describe('when() chaining', () => {
    it('should support method chaining', () => {
      const api = mockApi
        .when(({ sql }) => sql.includes('SELECT'), [])
        .when(({ sql }) => sql.includes('UPDATE'), [])
        .when(({ sql }) => sql.includes('DELETE'), [])

      expect(api).toBe(mockApi)
    })
  })

  describe('edge cases', () => {
    it('should handle queries with unknown SQL gracefully', async () => {
      // This tests the fallback to '[unknown sql]' when getSQL is not available
      mockApi.when(({ sql }) => sql === '[unknown sql]', [])

      // We can't easily create a query without getSQL, but we can test the error message
      const query = mockApi.db.select().from(TABLE.ensNames)

      // The query should work if we mock it properly
      mockApi.when(({ sql }) => sql.includes('select'), [])
      const result = await query
      expect(result).toEqual([])
    })

    it('should handle empty result arrays', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), [])

      const query = mockApi.db.select().from(TABLE.ensNames)
      const result = await query

      expect(result).toEqual([])
    })

    it('should handle null results', async () => {
      mockApi.when(({ sql }) => sql.includes('select'), null)

      const query = mockApi.db.select().from(TABLE.ensNames)
      const result = await query

      expect(result).toBeNull()
    })
  })
})
