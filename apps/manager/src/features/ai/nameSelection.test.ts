import { describe, expect, it } from 'vitest'
import type { BulkRenewName } from '@/features/bulk-renew'
import type { DashboardV2Name } from '@/features/dashboard/mergedNames'
import { buildDashboardSearchResults } from '@/features/dashboard/smartNameSearch'
import { getNameSelectionIssue } from './nameSelection'
import type { PreparedAiAction } from './prepareAiHandoff'

const now = new Date('2026-09-26T12:00:00Z')
const expiry = Math.floor(now.getTime() / 1000) + 10 * 86_400
const domain = (
  name: string,
  nameRoles: readonly ('owner' | 'manager')[] = ['owner'],
): DashboardV2Name => ({
  id: `id-${name}`,
  name,
  normalizedName: name,
  createdAt: 1,
  tokenId: null,
  registrationDate: 1,
  resolver: null,
  owner: { id: '0x00000000000000000000000000000000000000a1' },
  expiryDate: expiry,
  nameRoles,
})
const wallet = [
  domain('orbit.eth'),
  domain('fern.eth'),
  domain('coral.eth', ['manager']),
]
const results = (
  exactNames: readonly string[] | undefined,
  smartFilters: Parameters<
    typeof buildDashboardSearchResults
  >[0]['smartFilters'] = {},
) =>
  buildDashboardSearchResults({
    v2Names: wallet,
    v1Classified: [],
    searchQuery: '',
    sortField: 'name',
    sortDir: 'asc',
    exactNames,
    smartFilters,
    favoriteLabels: new Set(['orbit.eth', 'coral.eth']),
    now,
  })
const renewable = (names: readonly string[]): BulkRenewName[] =>
  names.map((name) => ({
    name,
    label: name.replace(/\.eth$/, ''),
    displayName: name,
    currentExpiry: BigInt(expiry),
  }))

describe('exact collection selection and loaded-wallet validation', () => {
  it('intersects exact names with every requested filter', () => {
    const matches = results(['orbit.eth', 'fern.eth', 'coral.eth'], {
      role: 'owner',
      favorite: 'yes',
      expiry: 'expiring',
      withinDays: 15,
      version: 'v2',
    })
    expect(matches.map(({ sortName }) => sortName)).toEqual(['orbit.eth'])
    expect(results(['fern.eth'], { favorite: 'yes' })).toEqual([])
    expect(results(['orbit.eth'], { role: 'manager' })).toEqual([])
  })

  it('never widens an empty or unmatched explicit selection to the wallet', () => {
    expect(results([])).toEqual([])
    expect(results(['missing.eth'])).toEqual([])
    expect(results(undefined).map(({ sortName }) => sortName)).toEqual([
      'coral.eth',
      'fern.eth',
      'orbit.eth',
    ])
  })

  it('deduplicates and compares exact names without case sensitivity', () => {
    expect(
      results(['ORBIT.ETH', 'orbit.eth']).map(({ sortName }) => sortName),
    ).toEqual(['orbit.eth'])
  })

  it('does not call a known name missing merely because an AND filter excludes it', () => {
    const action: PreparedAiAction = {
      intent: 'bulk_renew',
      names: ['orbit.eth', 'fern.eth'],
      filters: { favorite: 'yes' },
    }
    const matches = results(action.names, action.filters)
    expect(matches.map(({ sortName }) => sortName)).toEqual(['orbit.eth'])
    expect(
      getNameSelectionIssue(action, true, matches, renewable(['orbit.eth']), [
        'orbit.eth',
        'fern.eth',
        'coral.eth',
      ]),
    ).toBeNull()
  })

  it('reports truly missing requested names before allowing a partial renewal', () => {
    const action: PreparedAiAction = {
      intent: 'bulk_renew',
      names: ['orbit.eth', 'missing.eth'],
      filters: {},
    }
    expect(
      getNameSelectionIssue(
        action,
        true,
        results(action.names),
        renewable(['orbit.eth']),
        ['ORBIT.ETH', null, undefined],
      ),
    ).toBe('These requested names are not in your wallet data: missing.eth.')
  })

  it('checks missing targets for exact read-only selections too', () => {
    expect(
      getNameSelectionIssue(
        { intent: 'find_names', names: ['missing.eth'], filters: {} },
        true,
        [],
        [],
        ['orbit.eth'],
      ),
    ).toContain('missing.eth')
  })

  it('waits for wallet data before deciding that names are missing', () => {
    expect(
      getNameSelectionIssue(
        { intent: 'bulk_renew', names: ['orbit.eth'], filters: {} },
        false,
        [],
        [],
        [],
      ),
    ).toBeNull()
  })

  it('prevents an exact request from silently dropping a name ineligible for the V2 flow', () => {
    const action: PreparedAiAction = {
      intent: 'bulk_renew',
      names: ['orbit.eth', 'fern.eth'],
      filters: {},
    }
    expect(
      getNameSelectionIssue(
        action,
        true,
        results(action.names),
        renewable(['orbit.eth']),
        ['orbit.eth', 'fern.eth'],
      ),
    ).toContain('Some matching names cannot be renewed')
  })

  it('does not apply exact-selection errors to ordinary filters or other actions', () => {
    expect(
      getNameSelectionIssue(
        { intent: 'bulk_renew', filters: { favorite: 'yes' } },
        true,
        results(undefined),
        [],
        [],
      ),
    ).toBeNull()
    expect(
      getNameSelectionIssue(
        { intent: 'view_name', name: 'orbit.eth' },
        true,
        [],
        [],
        [],
      ),
    ).toBeNull()
    expect(getNameSelectionIssue(null, true, [], [], [])).toBeNull()
  })
})
