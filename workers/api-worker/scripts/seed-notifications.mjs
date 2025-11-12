// Seed dummy notifications and a broadcast for local development
// Usage:
//   DATABASE_URL=postgres://user:pass@host/db \
//   node workers/api-worker/scripts/seed-notifications.mjs --address 0xYourAddress
//
// If DATABASE_URL is not provided, falls back to
// WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB from workers/api-worker/.env

import 'dotenv/config'
import { Pool } from 'pg'

function getArg(flag, fallback = undefined) {
  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB ||
  process.env.PG_CONNECTION_STRING

if (!connectionString) {
  console.error(
    'No database connection string found. Set DATABASE_URL or WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB.',
  )
  process.exit(1)
}

const address =
  getArg('--address') ||
  getArg('-a') ||
  // Reasonable default for local dev if not provided
  '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

const pool = new Pool({ connectionString })

const now = new Date()
const minutes = (n) => new Date(now.getTime() - n * 60 * 1000)
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
const inDays = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)

const randomKey = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1) Upsert user by address and get id
    const userRes = await client.query(
      `INSERT INTO users (address)
       VALUES ($1)
       ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
       RETURNING id`,
      [address],
    )
    const userId = userRes.rows[0].id

    // 2) Personal notifications
    // 2a) Transferred (unread)
    await client.query(
      `INSERT INTO notifications (user_id, kind, payload, created_at, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        userId,
        'name-transferred',
        JSON.stringify({
          name: 'erni.eth',
          txHash:
            '0xa3c4bbd730a6d8f90bfa6e7a1a2cc1e1a3b2c1d0f9e8d7c6b5a4f3e2d1c0b9a8',
          to: address,
        }),
        minutes(30),
        randomKey('seed:transferred:erni.eth'),
      ],
    )

    // 2b) Name expiry in 30 days (read)
    await client.query(
      `INSERT INTO notifications (user_id, kind, payload, created_at, read_at, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        userId,
        'name-expiry',
        JSON.stringify({ name: 'lizard.eth', expiryDate: inDays(30).getTime(), isOwner: true }),
        daysAgo(3),
        daysAgo(2),
        randomKey('seed:expiry:lizard.eth:30d'),
      ],
    )

    // 2c) Name expiry in 7 days (unread)
    await client.query(
      `INSERT INTO notifications (user_id, kind, payload, created_at, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        userId,
        'name-expiry',
        JSON.stringify({
          name: 'asdadadadadddddasdadasdadadadasdasdadasd.eth',
          expiryDate: inDays(7).getTime(),
          isOwner: true,
        }),
        daysAgo(4),
        randomKey('seed:expiry:longname.eth:7d'),
      ],
    )

    // 3) A sample broadcast (blog post)
    await client.query(
      `INSERT INTO broadcasts (kind, payload, created_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT DO NOTHING`,
      [
        'blog-post',
        JSON.stringify({
          title: "What's new at ENS – Notifications",
          url: 'https://ens.domains/blog',
          imageUrl:
            'https://assets.ens.domains/opengraph/ens-blog.png',
        }),
        daysAgo(1),
      ],
    )

    await client.query('COMMIT')
    console.log('✅ Seeded notifications for', address)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Seed failed:', err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
