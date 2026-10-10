import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { BignameError } from './errors'
import { isInV2Grace, readGraceNames, V2_GRACE_SECONDS } from './grace'
import type { AddressName } from './types'

const OWNER = '0x1111111111111111111111111111111111111111'
const NOW = 1_800_000_000n

const lapsed = (overrides: Partial<AddressName> = {}): AddressName => ({
  name: 'grace.eth',
  display_name: 'grace.eth',
  namespace: 'ens',
  namehash: '0x01',
  status: 'expired',
  authority: 'ens_v2',
  expires_at: String(NOW - 86_400n),
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: { owner: OWNER, release_kind: 'expired' },
  ...overrides,
})

describe('isInV2Grace', () => {
  it('holds an expired ENSv2 .eth name for its former owner until grace ends', () => {
    expect(isInV2Grace(lapsed(), OWNER.toUpperCase(), NOW)).toBe(true)
    expect(
      isInV2Grace(
        lapsed({ expires_at: String(NOW - V2_GRACE_SECONDS + 1n) }),
        OWNER,
        NOW,
      ),
    ).toBe(true)
    expect(
      isInV2Grace(
        lapsed({ expires_at: String(NOW - V2_GRACE_SECONDS) }),
        OWNER,
        NOW,
      ),
    ).toBe(false)
  })

  it('does not hold another holder’s, an ENSv1, a subname or an unexpired name', () => {
    expect(
      isInV2Grace(lapsed(), '0x2222222222222222222222222222222222222222', NOW),
    ).toBe(false)
    expect(isInV2Grace(lapsed({ authority: 'ens_v1' }), OWNER, NOW)).toBe(false)
    expect(isInV2Grace(lapsed({ name: 'sub.grace.eth' }), OWNER, NOW)).toBe(
      false,
    )
    expect(isInV2Grace(lapsed({ name: '.eth' }), OWNER, NOW)).toBe(false)
    expect(
      isInV2Grace(lapsed({ expires_at: String(NOW + 1n) }), OWNER, NOW),
    ).toBe(false)
  })
})

describe('readGraceNames', () => {
  const page = (
    data: readonly ReturnType<typeof lapsed>[],
    next: string | null,
  ) =>
    okAsync({
      data,
      page: {
        cursor: null,
        next_cursor: next,
        page_size: 200,
        total_count: null,
        has_more: next !== null,
      },
      meta: { as_of: {} },
    })

  it('reads the former owner window and keeps the names still in grace', async () => {
    const addressNames = vi.fn((_: string, query?: { cursor?: string }) =>
      query?.cursor
        ? page(
            [
              lapsed({
                name: 'other.eth',
                lapsed_registration: {
                  owner: '0x2222222222222222222222222222222222222222',
                  release_kind: 'expired',
                },
              }),
            ],
            null,
          )
        : page([lapsed()], 'next'),
    )

    const rows = await readGraceNames({ addressNames }, OWNER, NOW)

    expect(rows._unsafeUnwrap().map(({ name }) => name)).toEqual(['grace.eth'])
    expect(addressNames.mock.calls[0]?.[1]).toMatchObject({
      relation: 'former_owner',
      parent: 'eth',
      expires_after: String(NOW - V2_GRACE_SECONDS),
      expires_before: String(NOW + 1n),
    })
  })

  it('fails when bigname cannot answer', async () => {
    const addressNames = vi.fn(() =>
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const rows = await readGraceNames({ addressNames }, OWNER, NOW)

    expect(rows.isErr()).toBe(true)
  })
})
