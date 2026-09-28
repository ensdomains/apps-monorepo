import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import { prepareAiDetail } from './prepareAiDetail'
import { prepareAiHandoff } from './prepareAiHandoff'
import { hasCompleteSocialRequestEvidence } from './socialRequestEvidence'

const choice = (choice: string, confidence = 0.99) => ({
  type: 'choice',
  choice,
  confidence,
})

const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice('edit_profile', 0.59),
    fully_supported: { type: 'noul', noul: 0.38 },
    unsupported_requirement: { type: 'noul', noul: 0.58 },
    multi_action: { type: 'noul', noul: 0.04 },
    next_intent: choice('none', 0.93),
    request_mode: choice('requested', 1),
    action_count: choice('one', 0.99),
    profile_field: choice('farcaster', 0.54),
    profile_operation: choice('feature', 0.84),
    profile_value: choice('none', 1),
    profile_previous_value: choice('none', 1),
    ...overrides,
  },
})

describe('complete social requests with missing details', () => {
  it.each([
    {
      query: "Unpin feverfew.eth's Discord contact",
      name: 'feverfew.eth',
      field: 'discord',
      operation: 'unfeature',
      overrides: {
        intent: choice('manager_action', 0.37),
        fully_supported: { type: 'noul', noul: 0.51 },
        unsupported_requirement: { type: 'noul', noul: 0.41 },
        profile_field: choice('none', 0.55),
        profile_operation: choice('unfeature', 0.58),
        manager_action: choice('none', 0.72),
      },
    },
    {
      query: 'Remove the pin from the Reddit contact on cinquefoil.eth',
      name: 'cinquefoil.eth',
      field: 'reddit',
      operation: 'unfeature',
      overrides: {
        intent: choice('edit_profile', 0.45),
        fully_supported: { type: 'noul', noul: 0.71 },
        unsupported_requirement: { type: 'noul', noul: 0.38 },
        profile_field: choice('none', 0.59),
        profile_operation: choice('unfeature', 0.48),
      },
    },
    {
      query: 'Star the instgram contact on hellebore.eth',
      name: 'hellebore.eth',
      field: 'instagram',
      operation: 'feature',
      overrides: {
        intent: choice('favorite', 0.94),
        fully_supported: { type: 'noul', noul: 0.72 },
        unsupported_requirement: { type: 'noul', noul: 0.27 },
        profile_field: choice('none', 0.58),
        profile_operation: choice('feature', 0.95),
      },
    },
  ])('retains the complete resource and operation in $query', ({
    query,
    name,
    field,
    operation,
    overrides,
  }) => {
    const raw = response(overrides)
    const before = structuredClone(raw)
    const result = parseJevAiResponse(raw, query)
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name,
      section: 'contact',
      field,
      operation,
    })
    if (!result) throw new Error('Expected a complete social operation')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'ready',
      action: { name, proposal: { field, operation, value: '' } },
    })
    expect(raw).toEqual(before)
  })

  it('keeps the captured Farcaster operation while asking for its missing ENS name', () => {
    const raw = response()
    const before = structuredClone(raw)
    const result = parseJevAiResponse(
      raw,
      'Could you feature my Farcaster account?',
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      section: 'contact',
      field: 'farcaster',
      operation: 'feature',
    })
    if (!result) throw new Error('Expected a missing-name action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(
      prepareAiDetail(result.action, {}, 'name', 'pookie.eth'),
    ).toMatchObject({
      status: 'accepted',
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'pookie.eth',
          proposal: { field: 'farcaster', operation: 'feature', value: '' },
        },
      },
    })
    expect(raw).toEqual(before)
  })

  it.each([
    'feature',
    'unfeature',
  ] as const)('asks which contact to %s and preserves the supplied name and operation', (operation) => {
    const result = parseJevAiResponse(
      response({
        intent: choice('edit_profile', 0.88),
        fully_supported: { type: 'noul', noul: 0.9 },
        unsupported_requirement: { type: 'noul', noul: 0.18 },
        profile_field: choice('unknown', 0.42),
        profile_operation: choice(operation, 0.94),
      }),
      `Please ${operation} a contact on cinquefoil.eth`,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'cinquefoil.eth',
      section: 'contact',
      fieldRequested: true,
      operation,
    })
    if (!result) throw new Error('Expected a missing-field action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
    expect(
      prepareAiDetail(result.action, {}, 'profileField', 'reddit'),
    ).toMatchObject({
      status: 'accepted',
      preparation: {
        status: 'ready',
        action: {
          name: 'cinquefoil.eth',
          proposal: { field: 'reddit', operation, value: '' },
        },
      },
    })
  })

  it.each([
    { fully_supported: { type: 'noul', noul: 0.19 } },
    { unsupported_requirement: { type: 'noul', noul: 0.6 } },
    { request_mode: choice('negated') },
    { action_count: choice('many') },
    { intent: choice('unsupported') },
    { profile_field: choice('github') },
    { profile_field: choice('farcaster', Number.NaN) },
    { profile_operation: choice('remove') },
    { profile_operation: choice('feature', -0.01) },
    { profile_value: choice('value_1') },
  ])('does not discard conflicting or invalid evidence to ask a question %#', (override) => {
    expect(
      parseJevAiResponse(
        response(override),
        'Could you feature my Farcaster account?',
      ),
    ).toBeNull()
  })

  it.each([
    'Could you feature my Farcaster account every Monday?',
    'Could you feature my Farcaster account if I own the name?',
    'Could you feature my Farcaster account and renew pookie.eth?',
    'Could you feature my Farcaster account instead of my GitHub?',
    'Could you feature my Farcaster account without a confirmation?',
    'Could you feature my unknown-social account?',
    'Do not feature my Farcaster account',
  ])('keeps unsupported or extra requirements visible: %s', (query) => {
    expect(parseJevAiResponse(response(), query)).toBeNull()
  })

  it('never fills a missing field from a model guess', () => {
    const raw = response()
    const query = 'Please feature a contact on cinquefoil.eth'
    expect(hasCompleteSocialRequestEvidence(query, raw.answers)).toBe(false)
    expect(parseJevAiResponse(raw, query)).toBeNull()
  })
})
