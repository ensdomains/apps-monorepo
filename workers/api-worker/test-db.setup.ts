import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import {
  LOCAL_TEST_DATABASE_NAME,
  LOCAL_TEST_DATABASE_URL,
  requireLocalTestDatabase,
} from './src/test-utils/real-db-config.js'

export default async () => {
  if (process.env.RUN_REAL_DB_TESTS !== '1') return
  const url = requireLocalTestDatabase(
    process.env.RUN_REAL_DB_TESTS,
    process.env.REAL_DB_DATABASE_URL ?? LOCAL_TEST_DATABASE_URL,
  )
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [LOCAL_TEST_DATABASE_NAME],
    )
    if (existing.rowCount === 0)
      await admin.query(`CREATE DATABASE ${LOCAL_TEST_DATABASE_NAME}`)
  } finally {
    await admin.end()
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  } finally {
    await client.end()
  }
}
