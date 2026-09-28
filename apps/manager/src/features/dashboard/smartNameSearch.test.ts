import { describe, expect, it } from 'vitest'
import type { MergedItem } from './mergedNames'
import {
  isSmartFilterAvailable,
  matchesSmartNameFilters,
  removeSmartFilter,
} from './smartNameSearch'

const now = new Date('2026-09-23T12:00:00.000Z')
const day = 24 * 60 * 60

const makeName = (
  overrides: {
    readonly kind?: 'v1' | 'v2'
    readonly name?: string
    readonly expiry?: number | null
    readonly roles?: readonly ('owner' | 'manager')[]
    readonly eligible?: boolean | null
  } = {},
): MergedItem => {
  const kind = overrides.kind ?? 'v2'
  const sortName = overrides.name ?? 'alice.eth'
  const base = {
    kind,
    key: `${kind}-${sortName}`,
    sortName,
    sortExpiry: overrides.expiry ?? null,
    sortCreated: null,
  }
  return kind === 'v1'
    ? ({
        ...base,
        kind,
        classified: {
          nameRoles: overrides.roles ?? ['owner'],
          isMigrationEligible:
            overrides.eligible === null
              ? undefined
              : (overrides.eligible ?? false),
        },
      } as MergedItem)
    : ({
        ...base,
        kind,
        domain: { nameRoles: overrides.roles ?? ['owner'] },
      } as MergedItem)
}

const context = {
  now,
  primaryLabel: 'alice.eth',
  favoriteLabels: new Set(['alice.eth']),
}

describe('smart name filters', () => {
  it('combines expiry, role, version, favorite, and primary conditions', () => {
    const name = makeName({
      expiry: Math.floor(now.getTime() / 1000) + 45 * day,
      roles: ['owner', 'manager'],
    })
    expect(
      matchesSmartNameFilters(
        name,
        {
          expiry: 'expiring',
          withinDays: 45,
          role: 'manager',
          version: 'v2',
          favorite: 'yes',
          primary: 'yes',
        },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        name,
        { expiry: 'expiring', withinDays: 44 },
        context,
      ),
    ).toBe(false)
  })

  it('distinguishes an explicit non-expiring value from unknown expiry', () => {
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: 0 }),
        { expiry: 'non-expiring' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: null }),
        { expiry: 'non-expiring' },
        context,
      ),
    ).toBe(false)
  })

  it('uses the correct ENSv1 and ENSv2 grace periods', () => {
    const expired30DaysAgo = Math.floor(now.getTime() / 1000) - 30 * day
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v1', expiry: expired30DaysAgo }),
        { expiry: 'in-grace' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v2', expiry: expired30DaysAgo }),
        { expiry: 'past-grace' },
        context,
      ),
    ).toBe(true)
  })

  it('treats expired parent-issued subnames as past grace immediately', () => {
    const expiredYesterday = Math.floor(now.getTime() / 1000) - day
    for (const kind of ['v1', 'v2'] as const) {
      const subname = makeName({
        kind,
        name: 'child.alice.eth',
        expiry: expiredYesterday,
      })
      expect(
        matchesSmartNameFilters(subname, { expiry: 'in-grace' }, context),
      ).toBe(false)
      expect(
        matchesSmartNameFilters(subname, { expiry: 'past-grace' }, context),
      ).toBe(true)
    }
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: expiredYesterday }),
        { expiry: 'in-grace' },
        context,
      ),
    ).toBe(true)
  })

  it('changes grace state at the exact 28-day and 90-day boundaries', () => {
    const nowSeconds = Math.floor(now.getTime() / 1000)
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: nowSeconds - 28 * day + 1 }),
        { expiry: 'in-grace' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: nowSeconds - 28 * day }),
        { expiry: 'past-grace' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v1', expiry: nowSeconds - 90 * day }),
        { expiry: 'past-grace' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ expiry: nowSeconds }),
        { expiry: 'expired' },
        context,
      ),
    ).toBe(true)
  })

  it('limits upgrade eligibility filtering to ENSv1 names', () => {
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v1', eligible: true }),
        { upgrade: 'eligible' },
        context,
      ),
    ).toBe(true)
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v2' }),
        { upgrade: 'ineligible' },
        context,
      ),
    ).toBe(false)
    expect(
      matchesSmartNameFilters(
        makeName({ kind: 'v1', eligible: null }),
        { upgrade: 'ineligible' },
        context,
      ),
    ).toBe(false)
  })

  it('removes the day count with the expiry chip', () => {
    expect(
      removeSmartFilter(
        { expiry: 'expiring', withinDays: 45, role: 'owner' },
        'expiry',
      ),
    ).toEqual({ role: 'owner' })
  })

  it('requires migration data for upgrade filters and auth for favorites', () => {
    expect(
      isSmartFilterAvailable(
        { upgrade: 'eligible' },
        { migrationEnabled: false, isAuthenticated: true },
      ),
    ).toBe(false)
    expect(
      isSmartFilterAvailable(
        { favorite: 'yes' },
        { migrationEnabled: true, isAuthenticated: false },
      ),
    ).toBe(false)
  })
})
