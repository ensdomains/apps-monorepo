import { describe, expect, it } from 'vitest'
import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import { parseJevAiResponse } from './intent'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const response = (
  filters: SmartNameFilters = {},
  overrides: Record<string, unknown> = {},
) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    multi_action: { type: 'noul', noul: 0.01 },
    intent: choice('renew'),
    renewal_target: choice('wallet_set'),
    next_intent: choice('none'),
    request_mode: choice('requested'),
    action_count: choice('one'),
    selection_constraints: choice('represented'),
    search_shape: choice('conjunction'),
    expiry_window: choice('unsupported', 0.4),
    ...Object.fromEntries(
      [
        'expiry',
        'role',
        'version',
        'upgrade',
        'favorite',
        'primary',
        'sort',
      ].map((facet) => [
        facet,
        choice((filters[facet as keyof SmartNameFilters] as string) ?? 'any'),
      ]),
    ),
    ...overrides,
  },
})

describe('expiry metadata applicability after exact renewal duration extraction', () => {
  it.each<
    [string, SmartNameFilters, Record<string, unknown>, Record<string, unknown>]
  >([
    [
      'Renew the V2 names for 84 days',
      { version: 'v2' },
      { expiry_window: choice('positive_days', 0.46) },
      { durationDays: 84 },
    ],
    [
      'Add three years to names that I own',
      { role: 'owner' },
      { expiry_window: choice('unsupported', 0.5) },
      { durationYears: 3 },
    ],
    [
      'Renew favourite V1 names except primary names for two years',
      { version: 'v1', favorite: 'yes', primary: 'no' },
      { expiry_window: choice('unsupported', 0.52) },
      { durationYears: 2 },
    ],
    [
      'Renew those selected names for 84 days',
      {},
      { expiry_window: choice('positive_days', 0.46) },
      { durationDays: 84, referencedSelection: true },
    ],
    [
      'Increase the lifetime of the names I manage by 90 days',
      { role: 'manager' },
      { expiry_window: choice('unsupported', 0.27) },
      { durationDays: 90 },
    ],
    [
      'Extend V2 names that are not primary for 63 days',
      { version: 'v2', primary: 'no' },
      {
        expiry_window: choice('positive_days', 0.72),
        selection_constraints: choice('represented', 0.6),
      },
      { durationDays: 63 },
    ],
  ])('does not misread added duration as a cutoff: %s', (query, filters, overrides, detail) => {
    const actual = parseJevAiResponse(response(filters, overrides), query)
    expect(actual).toEqual({
      status: 'ok',
      action: { intent: 'bulk_renew', filters, ...detail },
    })
  })

  it('does not extend the generic support exception using window applicability', () => {
    expect(
      parseJevAiResponse(
        response(
          { version: 'v2' },
          {
            fully_supported: { type: 'noul', noul: 0.1 },
            unsupported_requirement: { type: 'noul', noul: 0.9 },
            selection_constraints: choice('represented', 0.3),
          },
        ),
        'Renew my V2 names for 84 days',
      ),
    ).toBeNull()
  })

  it('retains the existing global support exception with strict raw window agreement', () => {
    expect(
      parseJevAiResponse(
        response(
          { version: 'v2' },
          {
            fully_supported: { type: 'noul', noul: 0.1 },
            unsupported_requirement: { type: 'noul', noul: 0.9 },
            selection_constraints: choice('represented', 0.3),
            expiry_window: choice('none'),
          },
        ),
        'Renew my V2 names for 84 days',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { version: 'v2' },
      durationDays: 84,
    })
  })

  it.each([
    'selected.eth',
    'those.eth',
    'these.eth',
  ])('does not interpret an exact %s target as a previous selection', (name) => {
    expect(
      parseJevAiResponse(response(), `Renew ${name} and expiry.eth for 84 days`)
        ?.action,
    ).toEqual({
      intent: 'bulk_renew',
      names: [name, 'expiry.eth'],
      filters: {},
      durationDays: 84,
    })
  })

  it('keeps exact names that contain time-related words', () => {
    expect(
      parseJevAiResponse(
        response(),
        'Renew soon.eth and expiry.eth for 84 days',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      names: ['soon.eth', 'expiry.eth'],
      filters: {},
      durationDays: 84,
    })
  })

  it('keeps actual expiry windows and added renewal time independent', () => {
    const query = 'Renew names expiring within 37 days for 84 days'
    expect(
      parseJevAiResponse(
        response(
          { expiry: 'expiring' },
          { expiry_window: choice('positive_days') },
        ),
        query,
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'expiring', withinDays: 37 },
      durationDays: 84,
    })
    for (const window of [
      choice('unsupported'),
      choice('positive_days', 0.4),
      choice('none'),
    ])
      expect(
        parseJevAiResponse(
          response({ expiry: 'expiring' }, { expiry_window: window }),
          query,
        ),
      ).toBeNull()
  })

  it.each([
    null,
    {},
    [],
    { type: 'noul', noul: 1 },
    choice('unknown'),
    choice('unsupported', Number.NaN),
    choice('unsupported', -0.1),
    choice('unsupported', 1.1),
    { type: 'choice', choice: 'none', confidence: '0.9' },
  ])('retains malformed-window rejection: %j', (expiry_window) => {
    expect(
      parseJevAiResponse(
        response({ version: 'v2' }, { expiry_window }),
        'Renew V2 names for 84 days',
      ),
    ).toBeNull()
  })

  it.each([
    { selection_constraints: choice('unsupported') },
    { selection_constraints: choice('represented', Number.NaN) },
    { version: choice('v2', 0.1) },
    { version: choice('v1') },
    { primary: choice('yes') },
    { search_shape: choice('alternatives') },
    { search_shape: choice('conjunction', 0.1) },
    { favorite: null },
  ])('does not bypass independent selection evidence: %j', (overrides) => {
    expect(
      parseJevAiResponse(
        response({ version: 'v2' }, overrides),
        'Renew V2 names for 84 days',
      ),
    ).toBeNull()
  })

  it.each([
    'Renew V2 names for 84 days tomorrow',
    'Renew V2 names for 84 days on 2030-01-01',
    'Renew names expiring after 37 days for 84 days',
    'Renew names expiring in two weeks for 84 days',
    'Renew V2 names for days',
    'Renew V2 names for zero days',
    'Renew V2 names for two months',
    'Renew V2 names for 84 days and set their primary name',
    'Renew V2 names for 84 days if gas is cheap',
    'Renew V2 names for 84 days except cedar.eth',
  ])('requires the complete remainder to be represented: %s', (query) => {
    expect(parseJevAiResponse(response({ version: 'v2' }), query)).toBeNull()
  })

  it('does not apply renewal-context grammar without a positive extracted duration', () => {
    expect(
      parseJevAiResponse(response({ role: 'owner' }), 'to names that I own'),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response({ role: 'manager' }),
        'Increase the lifetime of the names I manage',
      ),
    ).toBeNull()
  })
})
