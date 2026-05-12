import indexerClient from '@ens-apps/indexer/urql'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockIndexerQuery } from './_fixtures'
import { getHasMigratedNames } from './getHasMigratedNames'

vi.mock('@ens-apps/indexer/urql', () => ({ default: { query: vi.fn() } }))

const queryMock = vi.mocked(indexerClient.query)
const respond = (r: { data?: unknown; error?: unknown }) =>
  mockIndexerQuery(queryMock, r)

const ADDR = '0x0000000000000000000000000000000000000001'

beforeEach(() => {
  queryMock.mockReset()
})

describe('getHasMigratedNames', () => {
  it('returns true when the indexer returns at least one migrated name', async () => {
    respond({ data: { domains: [{ id: 'alice.eth' }] } })
    const r = await getHasMigratedNames(ADDR)
    assert(r.isOk())
    expect(r.value).toBe(true)
  })

  it('returns false when the indexer returns no migrated names', async () => {
    respond({ data: { domains: [] } })
    const r = await getHasMigratedNames(ADDR)
    assert(r.isOk())
    expect(r.value).toBe(false)
  })

  it.each([
    ['error', { error: new Error('indexer 500') }],
    ['no data and no error', {}],
  ] as const)('returns err on %s', async (_, response) => {
    respond(response)
    const r = await getHasMigratedNames(ADDR)
    assert(r.isErr())
    expect(r.error._tag).toBe('GetHasMigratedNamesError')
  })

  it('uses a first-page existence query scoped to migrated names for the owner', async () => {
    respond({ data: { domains: [] } })
    await getHasMigratedNames('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')
    const vars = queryMock.mock.calls[0]?.[1] as {
      first?: number
      skip?: number
      where?: { isMigrated?: boolean; owner?: string }
    }

    expect(vars?.first).toBe(1)
    expect(vars?.skip).toBe(0)
    expect(vars?.where?.isMigrated).toBe(true)
    expect(vars?.where?.owner).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })
})
