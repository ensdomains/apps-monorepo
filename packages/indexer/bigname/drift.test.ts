import type { ResultAsync } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { toUnixSeconds } from './adapters'
import { createBignameClient } from './client'
import { type BignameError, isStale } from './errors'
import type { Address } from './types'

/**
 * Drift detection for the hand-written types: every typed route is read from
 * the live Sepolia API and the fields the apps rely on are asserted to exist
 * with the expected primitive type. The types come from bigname's docs, not
 * from a schema, and bigname changes shapes between releases, so this is
 * what says when they need regenerating.
 *
 * Opt in with BIGNAME_INTEGRATION=1. Values are not asserted, only shape, so
 * the fixture surviving a transfer or a renewal does not break the run.
 */
const integration = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.BIGNAME_INTEGRATION

// An ENSv2-native Sepolia name registered until 2029, with records and history.
const NAME = 'juveniles.eth'

const RESULT_STATUSES = [
  'ok',
  'not_found',
  'invalid_name',
  'mismatch',
  'unsupported',
  'stale',
  'failed',
]
const AUTHORITIES = ['ens_v0', 'ens_v1', 'ens_v2']
const REGISTRATION_STATUSES = [
  'active',
  'wrapped',
  'registered',
  'released',
  'unregistered',
]
const EVENT_TYPES = [
  'registration',
  'renewal',
  'release',
  'expiry',
  'transfer',
  'authority',
  'resolver',
  'record',
  'primary_name',
  'permission',
  'subregistry',
]

type Shape = Record<string, 'string' | 'number' | 'boolean' | 'object'>

const expectShape = (value: unknown, shape: Shape) => {
  expect(value).toBeTypeOf('object')
  for (const [key, type] of Object.entries(shape)) {
    expect(value, `missing ${key}`).toHaveProperty(key)
    expect((value as Record<string, unknown>)[key], key).toBeTypeOf(type)
  }
}

const unwrap = <T>(result: { _unsafeUnwrap: () => T }) => result._unsafeUnwrap()

const ownerOf = (owner: Address | undefined): Address => {
  expect(owner).toBeTypeOf('string')
  return owner as Address
}

// A string is not enough: the docs and the wire have disagreed on the format.
const expectTimestamp = (value: unknown, label: string) => {
  expect(value, label).toBeTypeOf('string')
  expect(toUnixSeconds(value as string), `${label} does not parse`).toBeTypeOf(
    'number',
  )
}

// The dates the shared reads convert. Optional on the wire, so only checked
// when present.
const READ_DATES = [
  'expires_at',
  'registered_at',
  'created_at',
  'migrated_at',
] as const

const expectReadDates = (value: object) => {
  for (const key of READ_DATES) {
    if (key in value) {
      expectTimestamp((value as Record<string, unknown>)[key], key)
    }
  }
}

// A current-state collection's first page answers 409 when the publication
// moves mid-read. Retrying is the caller's job, and here the caller is us.
const once = async <T>(
  read: () => ResultAsync<T, BignameError>,
): Promise<T> => {
  const first = await read()
  const result = first.isErr() && isStale(first.error) ? await read() : first
  return result._unsafeUnwrap()
}

describe.skipIf(!integration)(
  'bigname wire shapes on sepolia',
  { timeout: 30_000 },
  () => {
    const client = createBignameClient('https://sepolia.api.bigname.sh')

    it('status', async () => {
      const { data, meta } = unwrap(await client.status())

      expectShape(data, { status: 'string', chains: 'object' })
      expect(['ready', 'degraded', 'stale']).toContain(data.status)
      expectShape(data.chains['11155111'], {
        indexed_block: 'number',
        status: 'string',
      })
      expect(meta).toBeTypeOf('object')
    })

    it('name detail', async () => {
      const { data, meta } = unwrap(await client.name(NAME))

      expectShape(data, {
        name: 'string',
        display_name: 'string',
        namespace: 'string',
        namehash: 'string',
        status: 'string',
      })
      expect(RESULT_STATUSES).toContain(data.status)
      expect(AUTHORITIES).toContain(data.authority)
      expect(REGISTRATION_STATUSES).toContain(data.registration_status)
      expectShape(data.resolver, { chain_id: 'number', address: 'string' })
      expectTimestamp(data.registered_at, 'registered_at')
      expectTimestamp(data.expires_at, 'expires_at')
      expectReadDates(data)
      expectShape(meta.as_of?.['11155111'], {
        block_number: 'number',
        block_hash: 'string',
      })
      expectTimestamp(meta.as_of?.['11155111']?.timestamp, 'as_of.timestamp')
    })

    it('records with inventory', async () => {
      const { data } = unwrap(
        await client.nameRecords(NAME, { include: ['inventory'] }),
      )

      expectShape(data, { namespace: 'string', records: 'object' })
      expectShape(data.inventory, {
        known_keys: 'object',
        unset_keys: 'object',
        unsupported_keys: 'object',
      })
      for (const answer of Object.values(data.records)) {
        expect(RESULT_STATUSES).toContain(answer?.status)
      }
    })

    it('names expiry window', async () => {
      const now = new Date()
      const later = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
      const { data, page } = await once(() =>
        client.names({
          namespace: 'ens',
          expires_after: now.toISOString(),
          expires_before: later.toISOString(),
          page_size: 3,
        }),
      )

      expectShape(page, { page_size: 'number', has_more: 'boolean' })
      expect(page?.total_count).toBeNull()
      for (const row of data) {
        expectShape(row, {
          name: 'string',
          namehash: 'string',
          registration_status: 'string',
        })
        expectTimestamp(row.expires_at, 'expires_at')
      }
    })

    it('subnames', async () => {
      const { data, page } = await once(() =>
        client.subnames(NAME, { include: ['counts'], page_size: 5 }),
      )

      expect(page?.total_count).toBeTypeOf('number')
      for (const row of data) {
        expectShape(row, {
          name: 'string',
          namehash: 'string',
          registration_status: 'string',
        })
      }
    })

    it('name history with data and raw', async () => {
      const { data, page } = unwrap(
        await client.nameHistory(NAME, {
          include: ['data', 'raw', 'total_count'],
          page_size: 5,
        }),
      )

      expect(page?.total_count).toBeTypeOf('number')
      expect(data.length).toBeGreaterThan(0)
      for (const row of data) {
        expectShape(row, {
          id: 'string',
          type: 'string',
          name: 'string',
          namespace: 'string',
          kind: 'string',
          data: 'object',
        })
        expect(EVENT_TYPES).toContain(row.type)
      }
    })

    it('address names with counts and role summary', async () => {
      const owner = unwrap(await client.name(NAME)).data.owner
      expect(owner).toBeTypeOf('string')
      const { data, page } = await once(() =>
        client.addressNames(owner as string, {
          relation: 'any',
          include: ['counts', 'role_summary'],
          page_size: 5,
        }),
      )

      expect(page?.total_count).toBeTypeOf('number')
      expect(data.length).toBeGreaterThan(0)
      for (const row of data) {
        expectShape(row, {
          name: 'string',
          namehash: 'string',
          registration_status: 'string',
          relations: 'object',
          is_primary: 'boolean',
          subname_count: 'number',
        })
        expect(AUTHORITIES).toContain(row.authority)
        expectReadDates(row)
      }
    })

    it('address history', async () => {
      const owner = ownerOf(unwrap(await client.name(NAME)).data.owner)
      const { data, page } = unwrap(
        await client.addressHistory(owner, { include: ['data'], page_size: 5 }),
      )

      expect(page?.total_count).toBeTypeOf('number')
      for (const row of data) {
        expectShape(row, { id: 'string', type: 'string', namespace: 'string' })
        expect(EVENT_TYPES).toContain(row.type)
      }
    })

    it('events', async () => {
      const { data } = unwrap(
        await client.events({
          name: NAME,
          include: ['data', 'raw'],
          page_size: 5,
        }),
      )

      expect(data.length).toBeGreaterThan(0)
      for (const row of data) {
        expectShape(row, { id: 'string', type: 'string', kind: 'string' })
        expect(EVENT_TYPES).toContain(row.type)
      }
    })

    it('permissions', async () => {
      const response = await once(() =>
        client.permissions({ name: NAME, page_size: 10 }),
      )

      expect(response.data.length).toBeGreaterThan(0)
      for (const row of response.data) {
        expectShape(row, {
          address: 'string',
          grant_scope: 'object',
          powers: 'object',
          registration_id: 'string',
          authority_context: 'string',
        })
      }
      // Partial by design: the surfaces not listed are named in meta.
      expect(response.meta.completeness).toBe('partial')
      expect(response.meta.unlisted_permission_surfaces).toBeTypeOf('object')
    })

    it('lookup', async () => {
      const owner = ownerOf(unwrap(await client.name(NAME)).data.owner)
      const { data } = unwrap(
        await client.lookup({
          inputs: [
            { name: NAME },
            { address: owner, relation: 'owner', page_size: 2 },
          ],
          profile: 'feed',
        }),
      )

      expect(data).toHaveLength(2)
      expectShape(data[0], {
        kind: 'string',
        status: 'string',
        record: 'object',
      })
      expectShape(data[1], {
        kind: 'string',
        status: 'string',
        records: 'object',
        page: 'object',
      })
    })
  },
)
