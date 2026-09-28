import { describe, expect, it } from 'vitest'
import { createBignameClient } from './client'

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
const NAME = 'stellularly.eth'

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

// The history routes take several seconds on Sepolia today (bigname #936).
describe.skipIf(!integration)(
  'bigname contract on sepolia',
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
      expect(data.registered_at).toBeTypeOf('string')
      expectShape(meta.as_of?.['11155111'], {
        block_number: 'number',
        block_hash: 'string',
        timestamp: 'string',
      })
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
      const { data, page } = unwrap(
        await client.names({
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
          expires_at: 'string',
        })
      }
    })

    it('subnames', async () => {
      const { data, page } = unwrap(
        await client.subnames(NAME, { include: ['counts'], page_size: 5 }),
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
      const { data, page } = unwrap(
        await client.addressNames(owner as string, {
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
      }
    })

    it('address history', async () => {
      const owner = unwrap(await client.name(NAME)).data.owner as string
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
      const response = unwrap(
        await client.permissions({ name: NAME, page_size: 10 }),
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
      // Partial by contract: the surfaces not listed are named in meta.
      expect(response.meta.completeness).toBe('partial')
      expect(response.meta.unlisted_permission_surfaces).toBeTypeOf('object')
    })

    it('lookup', async () => {
      const owner = unwrap(await client.name(NAME)).data.owner as string
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
