import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import { prepareAiDetail } from './prepareAiDetail'
import { prepareAiHandoff } from './prepareAiHandoff'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})

const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice('manager_action', 0.97),
    fully_supported: { type: 'noul', noul: 0.73 },
    unsupported_requirement: { type: 'noul', noul: 0.36 },
    multi_action: { type: 'noul', noul: 0.04 },
    next_intent: choice('none', 0.87),
    request_mode: choice('requested', 1),
    action_count: choice('one', 0.98),
    manager_action: choice('copy_profile_address', 0.99),
    manager_constraints: choice('represented', 0.11),
    manager_address_network: choice('coin_501', 0.89),
    profile_field: choice('address', 0.9),
    profile_operation: choice('none', 0.48),
    profile_value: choice('none', 1),
    profile_previous_value: choice('none', 1),
    ...overrides,
  },
})

describe('complete clipboard requests preserve known details during clarification', () => {
  it('retains the exact Solana choice while asking for a missing name', () => {
    const raw = response()
    const before = structuredClone(raw)
    const interpreted = parseJevAiResponse(
      raw,
      'Copy the Solana profile address',
    )
    expect(interpreted?.action).toEqual({
      intent: 'manager_action',
      kind: 'copy_profile_address',
      addressCoinType: 501,
    })
    if (!interpreted) throw new Error('Expected the name clarification')
    expect(prepareAiHandoff(interpreted.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(
      prepareAiDetail(interpreted.action, {}, 'name', 'pookie.eth'),
    ).toMatchObject({
      status: 'accepted',
      preparation: {
        status: 'ready',
        action: { name: 'pookie.eth', addressCoinType: 501 },
      },
    })
    expect(raw).toEqual(before)
  })

  it.each([
    { manager_constraints: choice('unsupported', 0.11) },
    { manager_constraints: choice('represented', Number.NaN) },
    { manager_constraints: choice('represented', -0.1) },
    { manager_constraints: choice('represented', 1.01) },
    { manager_constraints: undefined },
    { manager_constraints: [] },
    { manager_action: choice('copy_profile_address', 0.64) },
    { manager_address_network: choice('coin_501', 0.64) },
    { manager_address_network: choice('coin_0') },
    { manager_address_network: choice('missing') },
    { request_mode: choice('unclear') },
    { action_count: choice('many') },
  ])('rejects opposing, invalid, or uncertain applicable choices %#', (override) => {
    expect(
      parseJevAiResponse(response(override), 'Copy the Solana profile address'),
    ).toBeNull()
  })

  it.each([
    'Do not copy the Solana profile address',
    'Copy the Solana profile address tomorrow',
    'Copy the Solana profile address to my friend',
    'Copy the Solana profile address and favourite pookie.eth',
    'Copy the Solana profile address if it is verified',
    'Copy the Solana profile address, but use my wallet when it is missing',
  ])('cannot discard an unrepresented clause: %s', (query) => {
    expect(parseJevAiResponse(response(), query)).toBeNull()
  })
})

const missingFieldResponse = (overrides: Record<string, unknown> = {}) =>
  response({
    intent: choice('favorite', 0.52),
    fully_supported: { type: 'noul', noul: 0.53 },
    unsupported_requirement: { type: 'noul', noul: 0.39 },
    manager_action: choice('none', 0.52),
    profile_field: choice('none', 0.74),
    profile_operation: choice('none', 0.26),
    ...overrides,
  })

describe('explicit social operation with an unspecified field', () => {
  it('retains pin as feature when the model abstains and asks which contact', () => {
    const raw = missingFieldResponse()
    const before = structuredClone(raw)
    const interpreted = parseJevAiResponse(
      raw,
      'Please pin a contact on pookie.eth',
    )
    expect(interpreted?.action).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      operation: 'feature',
      fieldRequested: true,
    })
    if (!interpreted) throw new Error('Expected the social field clarification')
    expect(prepareAiHandoff(interpreted.action)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
    expect(
      prepareAiDetail(interpreted.action, {}, 'profileField', 'reddit'),
    ).toMatchObject({
      status: 'accepted',
      preparation: {
        status: 'ready',
        action: {
          name: 'pookie.eth',
          proposal: { field: 'reddit', operation: 'feature', value: '' },
        },
      },
    })
    expect(raw).toEqual(before)
  })

  it.each([
    { profile_operation: choice('none', 0.65) },
    { profile_operation: choice('none', Number.NaN) },
    { profile_operation: choice('remove', 0.26) },
    { profile_operation: choice('unfeature', 0.26) },
    { profile_operation: choice('unsupported', 0.26) },
    { profile_operation: undefined },
    { profile_field: choice('github') },
    { profile_value: choice('value_1') },
    { intent: choice('unsupported') },
  ])('does not reinterpret contradictory or invalid votes %#', (override) => {
    expect(
      parseJevAiResponse(
        missingFieldResponse(override),
        'Please pin a contact on pookie.eth',
      ),
    ).toBeNull()
  })

  it.each([
    'Please pin a contact on pookie.eth tomorrow',
    'Please pin a contact on pookie.eth if it is verified',
    'Please pin a contact on pookie.eth and renew it',
    'Do not pin a contact on pookie.eth',
  ])('does not use missing detail as permission to drop text: %s', (query) => {
    expect(parseJevAiResponse(missingFieldResponse(), query)).toBeNull()
  })
})
