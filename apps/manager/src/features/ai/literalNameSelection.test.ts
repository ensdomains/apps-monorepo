import { describe, expect, it } from 'vitest'
import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import {
  hasLiteralNameSelectionAgreement,
  proveLiteralNameSelection,
} from './literalNameSelection'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (filters: SmartNameFilters = {}) => ({
  ...Object.fromEntries(
    ['expiry', 'role', 'version', 'upgrade', 'favorite', 'primary', 'sort'].map(
      (facet) => [
        facet,
        choice((filters[facet as keyof SmartNameFilters] as string) ?? 'any'),
      ],
    ),
  ),
  search_shape: choice('conjunction'),
  expiry_window: choice(
    filters.withinDays === undefined
      ? filters.expiry === 'expiring'
        ? 'soon'
        : 'none'
      : 'positive_days',
  ),
})

describe('complete literal selection proof', () => {
  it.each<[string, SmartNameFilters]>([
    [
      'Show my V1 favorite names, soonest expiry first',
      { version: 'v1', favorite: 'yes', sort: 'expiry-asc' },
    ],
    [
      'Show my manager names expiring within 45 days',
      { role: 'manager', expiry: 'expiring', withinDays: 45 },
    ],
    [
      'Find my names that are in grace and favorites',
      { expiry: 'in-grace', favorite: 'yes' },
    ],
    [
      'Show names past the grace period, sorted by latest expiry',
      { expiry: 'past-grace', sort: 'expiry-desc' },
    ],
    ['List my expired V2 names', { expiry: 'expired', version: 'v2' }],
    [
      'Show names I own, ordered by name descending',
      { role: 'owner', sort: 'name-desc' },
    ],
    ['Show ENSv1 names that I manage', { version: 'v1', role: 'manager' }],
    ['List my non-expiring names', { expiry: 'non-expiring' }],
    ['Show names that never expire', { expiry: 'non-expiring' }],
    ['Show names not expired', { expiry: 'active' }],
    ['Find names eligible for upgrade', { upgrade: 'eligible' }],
    [
      'List V1 names not eligible for migration',
      { version: 'v1', upgrade: 'ineligible' },
    ],
    ['Show names excluding favorites', { favorite: 'no' }],
    ['Show names without my primary name', { primary: 'no' }],
    [
      'Show names expiring in the next forty-five days',
      { expiry: 'expiring', withinDays: 45 },
    ],
    ['Show names expiring soon', { expiry: 'expiring' }],
    [
      'Find V2 names with expiry within twenty-nine days',
      { version: 'v2', expiry: 'expiring', withinDays: 29 },
    ],
    ['Show favorite names in my wallet', { favorite: 'yes' }],
  ])('accounts for every supported clause: %s', (query, filters) => {
    expect(proveLiteralNameSelection(query)).toEqual({
      filters,
      scope: { kind: 'all' },
    })
    expect(hasLiteralNameSelectionAgreement(query, answers(filters))).toBe(true)
  })

  it('preserves exact targets without interpreting their words as attributes', () => {
    const names = ['manager.eth', 'grace.eth']
    const query = 'Renew [ENS_NAME] and [ENS_NAME_2], expiring within 84 days'
    const filters = { expiry: 'expiring' as const, withinDays: 84 }
    expect(proveLiteralNameSelection(query, names)).toEqual({
      filters,
      scope: { kind: 'exact', names },
    })
    expect(
      hasLiteralNameSelectionAgreement(query, answers(filters), names),
    ).toBe(true)
    expect(proveLiteralNameSelection(query, names.slice(0, 1))).toBeNull()
    expect(proveLiteralNameSelection(query)).toBeNull()
    expect(
      proveLiteralNameSelection('Renew manager.eth and grace.eth', names),
    ).toBeNull()
  })

  it('keeps previous-selection scope distinct from all wallet names', () => {
    expect(
      proveLiteralNameSelection('Renew those names except favorites'),
    ).toEqual({ filters: { favorite: 'no' }, scope: { kind: 'reference' } })
    expect(proveLiteralNameSelection('Show all my names')).toEqual({
      filters: {},
      scope: { kind: 'all' },
    })
    expect(proveLiteralNameSelection('Renew selected names')).toEqual({
      filters: {},
      scope: { kind: 'reference' },
    })
    expect(proveLiteralNameSelection('Renew those matching names')).toEqual({
      filters: {},
      scope: { kind: 'reference' },
    })
    expect(
      proveLiteralNameSelection('Renew those [ENS_NAME]', ['cedar.eth']),
    ).toBeNull()
  })

  it.each([
    'Show favorite names or V1 names',
    'Show names in grace or expired',
    'Show not V1 names',
    'Show names I do not own',
    'Show names expiring within 45 days and cheaper than 10 dollars',
    'Show names expiring between 10 and 45 days',
    'Show names expiring in -45 days',
    'Show names expiring in 1.5 days',
    'Show names expiring in one two days',
    'Show names expiring within 45 days and within 30 days',
    'Show names expiring within 0 days',
    'Show names expiring in 2 months',
    'Show names expiring tomorrow',
    'Show names with unknown expiry',
    'Show names whose expiry is missing',
    'Show names containing cat',
    'Show names about cats',
    'Show names and delete them',
    'Show names for 69 days',
    'Renew names in 69 days',
    'Show V1 V2 names',
    'Show active expired names',
    'Show primary names except primary',
    'Show eligible for upgrade V2 names',
    'Show [ENS_NAME] instead of [ENS_NAME_2]',
    'Show names and',
    'Show names and and favorites',
    'Show arbitrarily phrased favorites',
    'Do not show favorite names',
    'Show names only if eligible for upgrade',
    'Show manager names owned by me',
    'Show my favorites that are',
    'Show names only',
    'Show names and the',
    'Show favorites that',
    'Show names only when they are',
    'Find V2 names with expiry',
    'Find V2 names with expiry after twenty-nine days',
    'Renew those matching names if gas is cheap',
  ])('does not prove an unsupported or unaccounted request: %s', (query) => {
    expect(proveLiteralNameSelection(query)).toBeNull()
  })

  it('composes exact targets, relative clauses and a supported conditional property', () => {
    expect(
      proveLiteralNameSelection('Give names only when they are favorites'),
    ).toEqual({ filters: { favorite: 'yes' }, scope: { kind: 'all' } })
    expect(
      proveLiteralNameSelection(
        'Show [ENS_NAME] and [ENS_NAME_2] that are favorites',
        ['cedar.eth', 'birch.eth'],
      ),
    ).toEqual({
      filters: { favorite: 'yes' },
      scope: { kind: 'exact', names: ['cedar.eth', 'birch.eth'] },
    })
  })
})

describe('independent raw facet agreement', () => {
  it.each([
    'expiry',
    'role',
    'version',
    'upgrade',
    'favorite',
    'primary',
    'sort',
  ])('cannot conceal a contradictory %s facet behind literal overrides', (facet) => {
    const query = 'Show my V1 favorite names'
    const filters = { version: 'v1' as const, favorite: 'yes' as const }
    const response = answers(filters)
    expect(
      hasLiteralNameSelectionAgreement(query, {
        ...response,
        [facet]: choice(
          facet === 'version'
            ? 'v2'
            : facet === 'favorite'
              ? 'no'
              : 'unexpected',
        ),
      }),
    ).toBe(false)
  })

  it.each([
    undefined,
    null,
    {},
    { type: 'noul', noul: 1 },
    choice('any', Number.NaN),
    choice('any', -0.1),
    choice('any', 1.1),
  ])('does not promote malformed independent facet data: %j', (value) => {
    expect(
      hasLiteralNameSelectionAgreement('Show V1 names', {
        ...answers({ version: 'v1' }),
        favorite: value,
      }),
    ).toBe(false)
  })

  it('requires the literal day count and logical shape to agree', () => {
    const query = 'Show names expiring within 45 days'
    const response = answers({ expiry: 'expiring', withinDays: 45 })
    expect(
      hasLiteralNameSelectionAgreement(query, {
        ...response,
        expiry_window: choice('unsupported'),
      }),
    ).toBe(false)
    expect(
      hasLiteralNameSelectionAgreement(query, {
        ...response,
        expiry_window: choice('none'),
      }),
    ).toBe(false)
    expect(
      hasLiteralNameSelectionAgreement(query, {
        ...response,
        search_shape: choice('alternatives'),
      }),
    ).toBe(false)
    expect(hasLiteralNameSelectionAgreement(query, response)).toBe(true)
  })

  it('does not treat support votes as a substitute for facet agreement', () => {
    expect(
      hasLiteralNameSelectionAgreement('Show my V1 favorites', {
        ...answers({ version: 'v2', favorite: 'yes' }),
        selection_constraints: choice('represented'),
        fully_supported: { type: 'noul', noul: 1 },
      }),
    ).toBe(false)
  })
})
