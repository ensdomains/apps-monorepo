import { expect, it } from 'vitest'
import {
  LOCAL_TEST_DATABASE_NAME,
  LOCAL_TEST_DATABASE_URL,
  requireLocalTestDatabase,
} from './real-db-config.js'

it('requires explicit opt-in and the dedicated local database before setup or cleanup', () => {
  expect(() =>
    requireLocalTestDatabase(undefined, LOCAL_TEST_DATABASE_URL),
  ).toThrow('RUN_REAL_DB_TESTS')
  expect(requireLocalTestDatabase('1', LOCAL_TEST_DATABASE_URL)).toBe(
    LOCAL_TEST_DATABASE_URL,
  )
  for (const url of [
    `postgres://postgres:postgres@production.neon.tech:5432/${LOCAL_TEST_DATABASE_NAME}`,
    `postgres://postgres:postgres@db.localtest.me.evil.test:5432/${LOCAL_TEST_DATABASE_NAME}`,
    'postgres://postgres:postgres@db.localtest.me:5432/postgres',
    `${LOCAL_TEST_DATABASE_URL}?host=production.neon.tech`,
  ])
    expect(() => requireLocalTestDatabase('1', url)).toThrow('unsafe')
})
