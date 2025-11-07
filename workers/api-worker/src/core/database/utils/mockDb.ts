import { QueryPromise, QueryWithTypings, SQLWrapper } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core/dialect'
import { Mock, vi } from 'vitest'
import { Database } from '..'

type SqlMatcher = (query: QueryWithTypings) => boolean

type BasicQuery = QueryPromise<any> & SQLWrapper

interface MockEntry {
  match: SqlMatcher
  result: any
}

const dialect = new PgDialect()

export function createDrizzleProxySqlMock(db: Database) {
  const mocks: MockEntry[] = []
  const calls: QueryWithTypings[] = []

  const executeMock = vi.fn(function (this: BasicQuery) {
    const sqlObj = dialect.sqlToQuery(this.getSQL())

    calls.push(sqlObj)

    const entry = mocks.find((m) => m.match(sqlObj))
    if (!entry)
      return Promise.reject(
        new Error(
          `No mock registered for SQL:\n${sqlObj.sql}\n\nAll mocks:\n${mocks
            .map((m) => m.toString?.() || 'matcher')
            .join('\n')}`,
        ),
      )

    if (entry.result instanceof Error) {
      return Promise.reject(entry.result)
    }

    return Promise.resolve(entry.result)
  })

  /** Register a SQL matcher */
  function when(matcher: SqlMatcher, result: any) {
    mocks.push({ match: matcher, result })
    return api
  }

  /** Debug helpers */
  function reset() {
    mocks.length = 0
    calls.length = 0
    executeMock.mockReset()
  }

  /** Wrap query builders so their execute() resolves through our mock */
  function wrapQuery<T>(query: T): T {
    return new Proxy(query as any, {
      get(target, prop) {
        if (prop === 'execute') return executeMock.bind(query)
        if (['then', 'catch', 'finally'].includes(String(prop))) {
          const promise = executeMock.call(query)
          return promise[prop as 'then' | 'catch' | 'finally'].bind(promise)
        }

        const val = Reflect.get(target, prop)
        if (typeof val === 'function') {
          return (...args: any[]) => {
            const result = val.apply(target, args)
            if (result && typeof result === 'object') {
              return wrapQuery(result)
            }
            return result
          }
        }
        return val
      },
    })
  }

  /** Top-level db proxy */
  const dbProxy = new Proxy(db, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver)

      // Methods returning queries (select/update/etc.)
      if (typeof val === 'function' && QUERY_METHODS.includes(prop as any)) {
        return (...args: any[]) => wrapQuery(val.apply(target, args))
      }

      // Relational query helpers (db.query.table.findFirst etc.)
      if (prop === 'query' && typeof val === 'object') {
        return new Proxy(val, {
          get(t, p) {
            const qp = Reflect.get(t, p)
            if (typeof qp === 'object' && qp !== null) {
              return new Proxy(qp, {
                get(innerT, innerP) {
                  const innerVal = Reflect.get(innerT, innerP)
                  if (typeof innerVal === 'function') {
                    return (...args: any[]) =>
                      wrapQuery(innerVal.apply(innerT, args))
                  }
                  return innerVal
                },
              })
            }
            return qp
          },
        })
      }

      return val
    },
  })

  const api = { db: dbProxy, when, calls, executeMock, reset }
  return api
}

const QUERY_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'with',
  '$with',
] as const
