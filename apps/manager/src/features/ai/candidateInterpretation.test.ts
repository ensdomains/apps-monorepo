import { describe, expect, it } from 'vitest'
import { buildUncertainAiCandidate } from './candidateInterpretation'
import { parseJevAiResponse } from './intent'

const choice = (choice: string, confidence = 0.99) => ({
  type: 'choice',
  choice,
  confidence,
})
const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice('edit_profile', 0.5),
    next_intent: choice('none'),
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    request_mode: choice('requested'),
    action_count: choice('one'),
    selection_constraints: choice('represented'),
    ...overrides,
  },
})
const pinQuery = 'pin githb on cedar.eth'
const pinResponse = (overrides: Record<string, unknown> = {}) =>
  response({
    profile_field: choice('github', 0.88),
    profile_operation: choice('feature', 0.63),
    ...overrides,
  })

describe('internal uncertain first-intent candidates', () => {
  it('retains uncertainty for a fully bounded profile action without changing the public parser', () => {
    const supplied = pinResponse()
    const original = structuredClone(supplied)
    expect(parseJevAiResponse(supplied, pinQuery)).toBeNull()
    expect(buildUncertainAiCandidate(supplied, pinQuery)).toEqual({
      interpretation: {
        status: 'ok',
        action: {
          intent: 'edit_profile',
          name: 'cedar.eth',
          field: 'github',
          section: 'contact',
          operation: 'feature',
        },
      },
      uncertainty: {
        kind: 'main_intent',
        choice: 'edit_profile',
        confidence: 0.5,
      },
    })
    expect(supplied).toEqual(original)
    expect(parseJevAiResponse(supplied, pinQuery)).toBeNull()
  })

  it.each([
    undefined,
    null,
    [],
    'edit_profile',
    { type: 'text', choice: 'edit_profile', confidence: 0.5 },
    { type: 'choice', choice: 'invented', confidence: 0.5 },
    { type: 'choice', choice: 'unsupported', confidence: 0.5 },
    { type: 'choice', choice: 'none', confidence: 0.5 },
    { type: 'choice', choice: 'edit_profile', confidence: '0.5' },
    { type: 'choice', choice: 'edit_profile' },
    choice('edit_profile', Number.NaN),
    choice('edit_profile', Number.POSITIVE_INFINITY),
    choice('edit_profile', -0.01),
    choice('edit_profile', 1.01),
  ])('rejects malformed or unsupported first-intent answer %#', (intent) => {
    expect(
      buildUncertainAiCandidate(pinResponse({ intent }), pinQuery),
    ).toBeNull()
  })

  it.each([
    0.55, 0.8, 1,
  ])('does not recover a confident first intent at %s', (confidence) => {
    const supplied = pinResponse({ intent: choice('edit_profile', confidence) })
    expect(parseJevAiResponse(supplied, pinQuery)).not.toBeNull()
    expect(buildUncertainAiCandidate(supplied, pinQuery)).toBeNull()
  })

  it('does not generate candidates for existing deterministic accepted exceptions', () => {
    const supplied = response({
      intent: choice('renew', 0.5),
      expiry: choice('any'),
      role: choice('any'),
      version: choice('any'),
      upgrade: choice('any'),
      favorite: choice('any'),
      primary: choice('any'),
      sort: choice('any'),
    })
    expect(parseJevAiResponse(supplied, 'Renew those names')).not.toBeNull()
    expect(buildUncertainAiCandidate(supplied, 'Renew those names')).toBeNull()
  })

  it.each([
    { fully_supported: { type: 'noul', noul: 0.49 } },
    { unsupported_requirement: { type: 'noul', noul: 0.7 } },
    { fully_supported: { type: 'noul', noul: Number.NaN } },
    { multi_action: { type: 'noul', noul: 0.5 } },
    { request_mode: choice('negated') },
    { request_mode: choice('unclear') },
    { request_mode: choice('requested', 0.64) },
    { action_count: choice('many') },
    { profile_field: choice('unsupported') },
    { profile_operation: choice('remove') },
  ])('preserves every unrelated support, polarity, count, and field gate %#', (overrides) => {
    expect(
      buildUncertainAiCandidate(pinResponse(overrides), pinQuery),
    ).toBeNull()
  })

  it.each([
    'Do not pin githb on cedar.eth',
    'pin githb on cedar.eth and transfer the name',
    'pin githb on cedar.eth only when it expires',
    'Set cedar.eth GitHub to new-handle and email to new@example.com',
  ])('rejects prohibited or partially represented requests: %s', (query) => {
    expect(buildUncertainAiCandidate(pinResponse(), query)).toBeNull()
  })

  it('retains exact supplied values and replacement direction', () => {
    const query = 'Replace cedar.eth GitHub handle cedar-old with cedar-nwe'
    const supplied = response({
      profile_field: choice('github'),
      profile_operation: choice('replace'),
      profile_value: choice('value_2'),
      profile_previous_value: choice('value_1'),
    })
    expect(
      buildUncertainAiCandidate(supplied, query)?.interpretation.action,
    ).toMatchObject({
      field: 'github',
      value: 'cedar-nwe',
      expectedValue: 'cedar-old',
    })
    expect(
      buildUncertainAiCandidate(
        response({
          ...supplied.answers,
          profile_value: choice('value_1'),
          profile_previous_value: choice('value_2'),
        }),
        query,
      ),
    ).toBeNull()
  })

  it.each([
    'Renew cedar.eth for minus ten days',
    'Renew cedar.eth for half a year',
    'Renew cedar.eth for 1.5 years',
  ])('retains exact duration validation: %s', (query) => {
    expect(
      buildUncertainAiCandidate(
        response({ intent: choice('renew', 0.5) }),
        query,
      ),
    ).toBeNull()
  })

  it('does not loosen the next-intent confidence requirement', () => {
    expect(
      buildUncertainAiCandidate(
        response({
          intent: choice('register', 0.5),
          next_intent: choice('set_primary', 0.54),
          multi_action: { type: 'noul', noul: 0.99 },
          action_count: choice('two'),
        }),
        'Register cedar.eth for 69 days and then set it as primary',
      ),
    ).toBeNull()
  })

  it('retains main-intent uncertainty after complete literal selection proof', () => {
    const supplied = response({
      intent: choice('find_names', 0.5),
      expiry: choice('expiring'),
      role: choice('any'),
      version: choice('any'),
      upgrade: choice('any'),
      favorite: choice('any'),
      primary: choice('any'),
      sort: choice('any'),
      search_shape: choice('conjunction'),
      expiry_window: choice('positive_days'),
      selection_constraints: choice('represented', 0.64),
    })
    const query = 'Show names expiring within 45 days'
    const original = structuredClone(supplied)
    expect(buildUncertainAiCandidate(supplied, query)).toMatchObject({
      interpretation: {
        action: {
          intent: 'find_names',
          filters: { expiry: 'expiring', withinDays: 45 },
        },
      },
      uncertainty: { kind: 'main_intent', confidence: 0.5 },
    })
    // The exact clause proof settles coverage only. The live parser still
    // rejects weak main intent, and an unrepresented extra clause stays out.
    expect(parseJevAiResponse(supplied, query)).toBeNull()
    expect(
      buildUncertainAiCandidate(supplied, `${query} with animal meanings`),
    ).toBeNull()
    expect(supplied).toEqual(original)
  })

  it('retains missing target details without inventing an ENS name', () => {
    expect(
      buildUncertainAiCandidate(response(), 'Set my GitHub to exact-handle')
        ?.interpretation.action,
    ).toEqual({
      intent: 'edit_profile',
      field: 'github',
      section: 'contact',
      value: 'exact-handle',
    })
  })
})
