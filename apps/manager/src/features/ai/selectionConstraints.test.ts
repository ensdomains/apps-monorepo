import { describe, expect, it } from 'vitest'
import { buildJevAiRequest, parseJevAiResponse } from './intent'
import { hasSupportedSelectionConstraints } from './selectionConstraints'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const noul = (value: number) => ({ type: 'noul', noul: value })
const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: noul(0.99),
    unsupported_requirement: noul(0.01),
    multi_action: noul(0.01),
    intent: choice('find_names'),
    next_intent: choice('none'),
    request_mode: choice('requested'),
    action_count: choice('one'),
    selection_constraints: choice('represented'),
    search_shape: choice('conjunction'),
    expiry_window: choice('none'),
    expiry: choice('any'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
})

describe('focused name selection support', () => {
  it('retains the existing coverage choice after the unsupported-property experiment', () => {
    const { questions } = buildJevAiRequest('Show my names in grace')
    expect(questions.selection_constraints.type).toBe('choice')
    expect(questions).not.toHaveProperty('selection_extra_property')
    expect(questions).not.toHaveProperty('selection_extra_behavior')
  })

  it('uses complete collection evidence for a weak global capability vote', () => {
    expect(
      parseJevAiResponse(
        response({
          fully_supported: noul(0.41),
          unsupported_requirement: noul(0.59),
          expiry: choice('in-grace'),
        }),
        'List all grace period names',
      ),
    ).toEqual({
      status: 'ok',
      action: { intent: 'find_names', filters: { expiry: 'in-grace' } },
    })
  })

  it('uses the same collection evidence when the unrelated global vote disagrees', () => {
    expect(
      parseJevAiResponse(
        response({
          fully_supported: noul(0.1),
          unsupported_requirement: noul(0.9),
          expiry: choice('in-grace'),
        }),
        'Show names in grace',
      )?.action,
    ).toEqual({ intent: 'find_names', filters: { expiry: 'in-grace' } })
  })

  it.each([
    'Show my names',
    'Show maple.eth and pine.eth',
    'Show those names',
  ])('distinguishes empty valid filters from invalid selection facets: %s', (query) => {
    expect(parseJevAiResponse(response(), query)).not.toBeNull()
    for (const overrides of [
      { search_shape: null },
      { search_shape: choice('alternatives') },
      { expiry_window: noul(0.01) },
      { expiry_window: choice('unsupported') },
    ]) {
      expect(parseJevAiResponse(response(overrides), query)).toBeNull()
    }
  })

  it('does not ignore an unsupported actual expiry filter while splitting renewal time', () => {
    expect(
      parseJevAiResponse(
        response({
          intent: choice('renew'),
          renewal_target: choice('wallet_set'),
          expiry: choice('expiring'),
          expiry_window: choice('unsupported'),
        }),
        'Renew those names expiring after 45 days for 56 days',
      ),
    ).toBeNull()
  })

  it('does not collapse a confident two-action warning into a single collection request', () => {
    expect(
      parseJevAiResponse(
        response({ action_count: choice('two'), expiry: choice('in-grace') }),
        'Show names in grace',
      ),
    ).toBeNull()
  })

  it('keeps exact targets and every requested AND facet', () => {
    expect(
      parseJevAiResponse(
        response({ favorite: choice('yes'), version: choice('v2') }),
        'Show only maple.eth and pine.eth that are favourites on V2',
      )?.action,
    ).toEqual({
      intent: 'find_names',
      names: ['maple.eth', 'pine.eth'],
      filters: { favorite: 'yes', version: 'v2' },
    })
  })

  it('keeps expiry window and additional renewal time independent', () => {
    expect(
      parseJevAiResponse(
        response({
          intent: choice('renew'),
          renewal_target: choice('wallet_set'),
          expiry: choice('expiring'),
          expiry_window: choice('positive_days'),
        }),
        'Give names expiring within 37 days another two years',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'expiring', withinDays: 37 },
      durationYears: 2,
    })
  })

  it.each([
    'Show names in grace with animal meanings',
    'Show names in grace with a GitHub profile',
    'Show the first five names in grace',
    'Renew names in grace when gas gets cheap',
  ])('rejects the whole request for an unsupported requirement: %s', (query) => {
    expect(
      parseJevAiResponse(
        response({
          expiry: choice('in-grace'),
          selection_constraints: choice('unsupported'),
        }),
        query,
      ),
    ).toBeNull()
  })

  it.each([
    undefined,
    null,
    [],
    {},
    choice('represented', Number.NaN),
    choice('represented', Number.POSITIVE_INFINITY),
    choice('represented', -0.01),
    choice('represented', 1.01),
    choice('unsupported'),
    choice('unknown'),
    noul(0.01),
    { type: 'choice', choice: 'represented', confidence: '0.99' },
  ])('does not override malformed or unsupported coverage evidence: %j', (answer) => {
    const answers = response({ selection_constraints: answer }).answers
    expect(hasSupportedSelectionConstraints(answers, true)).toBe(false)
    expect(parseJevAiResponse({ answers }, 'Show my favourites')).toBeNull()
  })

  it.each([
    [
      'Show names in grace or favourites',
      { search_shape: choice('alternatives') },
    ],
    [
      'Show names expiring between 10 and 20 days',
      { search_shape: choice('bounded_range') },
    ],
    [
      'Show names expiring after 45 days',
      { expiry_window: choice('unsupported') },
    ],
    [
      'Show names with unknown expiry',
      { search_shape: choice('unknown_expiry') },
    ],
  ])('retains independent shape and window rejection: %s', (query, overrides) => {
    expect(parseJevAiResponse(response(overrides), query)).toBeNull()
  })

  it('does not settle a second action using the collection support evidence', () => {
    expect(
      parseJevAiResponse(
        response({
          fully_supported: noul(0.01),
          unsupported_requirement: noul(0.99),
          expiry: choice('in-grace'),
          multi_action: noul(0.99),
          action_count: choice('two'),
          next_intent: choice('unsupported'),
        }),
        'Show names in grace and then sell them',
      ),
    ).toBeNull()
  })

  it('preserves captured legacy behavior without reinterpreting its confidence', () => {
    expect(hasSupportedSelectionConstraints({})).toBe(false)
    expect(
      hasSupportedSelectionConstraints({
        selection_constraints: choice('represented'),
      }),
    ).toBe(true)
    expect(
      hasSupportedSelectionConstraints({
        selection_constraints: choice('represented', 0.3),
      }),
    ).toBe(false)
    expect(
      hasSupportedSelectionConstraints({
        selection_constraints: choice('unsupported'),
      }),
    ).toBe(false)
    expect(
      hasSupportedSelectionConstraints(
        response({ selection_constraints: choice('unsupported') }).answers,
      ),
    ).toBe(false)
  })
})
