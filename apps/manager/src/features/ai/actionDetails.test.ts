import { describe, expect, it } from 'vitest'
import {
  getQuantityCandidates,
  hasNegatedAction,
  parseSemanticDuration,
} from './actionDetails'
import { parseJevAiResponse } from './intent'
import { prepareAiDetail } from './prepareAiDetail'
import { prepareAiHandoff } from './prepareAiHandoff'

const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const response = (intent: string, answers: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice(intent),
    next_intent: choice('none'),
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    multi_action: { type: 'noul', noul: 0.05 },
    request_mode: choice('requested'),
    action_count: choice('one'),
    ...answers,
  },
})

describe('grounded action details', () => {
  it.each([
    ['Register opal.eth for 60 days instead of 40 days', { durationDays: 60 }],
    ['Renew opal.eth for 45 days rather than 15 days', { durationDays: 45 }],
    ['Add another year to lantern.eth', { durationYears: 1 }],
  ])('preserves an unambiguous duration correction: %s', (query, expected) => {
    expect(parseSemanticDuration(query)).toEqual(expected)
  })

  it.each([
    ['for twenty one days', 21],
    ['for forty-five days', 45],
    ['for one hundred and twenty days', 120],
    ['for 1001 days', 1001],
    ['for 1,000 days', 1000],
    ['renew twenty-one.eth for 10 days', 10],
  ])('reads the exact supplied quantity in %s', (query, days) => {
    expect(parseSemanticDuration(query)).toEqual({ durationDays: days })
  })

  it('does not interpret digits in names or addresses as duration quantities', () => {
    expect(
      getQuantityCandidates('renew name123.eth for 10 days').map(
        ({ value }) => value,
      ),
    ).toEqual([10])
    expect(getQuantityCandidates('show ensv1 names')).toEqual([])
  })

  it.each([
    'plz extnd pookie.eth fr anothr 10 days',
    'I wanna keep pookie.eth for 10 more days',
  ])('prepares the exact ten-day renewal for %s', (query) => {
    const parsed = parseJevAiResponse(
      response('renew', {
        duration_purpose: choice('added'),
        duration_unit: choice('days'),
        duration_amount: choice('amount_1'),
      }),
      query,
    )
    expect(parsed?.action).toMatchObject({
      intent: 'renew',
      name: 'pookie.eth',
      durationDays: 10,
    })
    expect(parsed && prepareAiHandoff(parsed.action)).toMatchObject({
      status: 'ready',
      action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
    })
  })

  it.each([
    'in 10 days',
    'within 10 days',
    'after two years',
    'in forty days',
    'within one hundred days',
    'for -10 days',
    'for 1.5 days',
    'for 0 days',
    'for two months',
  ])('rejects invalid or scheduled duration despite optimistic model: %s', (duration) => {
    expect(
      parseSemanticDuration(`renew pookie.eth ${duration}`, {
        duration_purpose: choice('added'),
        duration_unit: choice('days'),
      }),
    ).toBeNull()
  })

  it.each([
    choice('unclear'),
    choice('requested', 0.2),
    { type: 'choice', choice: 'requested', confidence: Number.NaN },
  ])('does not propose an action with uncertain or malformed request mode', (request_mode) => {
    expect(
      parseJevAiResponse(
        response('renew', { request_mode }),
        'renew pookie.eth for 10 days',
      ),
    ).toBeNull()
  })

  it('does not silently choose one of multiple notification preferences', () => {
    expect(
      parseJevAiResponse(
        response('notification', {
          notification_preference: choice('unclear'),
        }),
        'mute favourite and owned name reminders',
      ),
    ).toBeNull()
  })

  it('rejects a model-selected target explicitly excluded by the user', () => {
    expect(
      parseJevAiResponse(
        response('set_primary', { target_name: choice('name_2') }),
        'set alice.eth as primary, not bob.eth',
      ),
    ).toBeNull()
  })

  it('rejects a model renewal for an explicit acquisition request', () => {
    expect(
      parseJevAiResponse(response('renew'), 'get pookie.eth for 69 days'),
    ).toBeNull()
  })

  it.each([
    'mute favourite expiry reminders',
    'Turn off favourite name expiry notifications',
    'Disable expiry alerts for my favorite names',
  ])('treats a literal disable command as an affirmative request: %s', (query) => {
    expect(
      parseJevAiResponse(
        response('notification', {
          request_mode: choice('negated'),
          notification_preference: choice('favouritedNameExpiry'),
          notification_operation: choice('disable'),
        }),
        query,
      )?.action,
    ).toEqual({
      intent: 'notification',
      preference: 'favouritedNameExpiry',
      enabled: false,
    })
  })

  it('still rejects an explicit prohibition in a notification command', () => {
    expect(
      parseJevAiResponse(
        response('notification', {
          request_mode: choice('requested'),
          notification_operation: choice('disable'),
        }),
        'do not mute favourite expiry reminders',
      ),
    ).toBeNull()
  })

  it('asks for the missing unit and keeps the supplied quantity', () => {
    const parsed = parseJevAiResponse(
      response('renew', {
        duration_purpose: choice('added'),
        duration_unit: choice('missing'),
      }),
      'renew pookie.eth for 10',
    )
    expect(parsed?.action).toMatchObject({
      intent: 'renew',
      durationAmount: 10,
    })
    if (!parsed) throw new Error('Expected a renewal draft')
    expect(prepareAiHandoff(parsed.action)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
    })
    expect(
      prepareAiDetail(parsed.action, {}, 'durationUnit', 'weeks'),
    ).toMatchObject({
      status: 'accepted',
      preparation: {
        status: 'ready',
        action: { intent: 'renew', name: 'pookie.eth', durationDays: 70 },
      },
    })
    expect(
      prepareAiDetail(parsed.action, {}, 'durationUnit', 'months'),
    ).toMatchObject({ status: 'invalid' })
  })

  it.each([
    'do not renew',
    "don't renew",
    'dont extend',
    'never favourite',
    'do not turn on',
  ])('recognizes forbidden actions: %s', (verb) => {
    expect(hasNegatedAction(`${verb} pookie.eth`)).toBe(true)
    expect(
      parseJevAiResponse(response('renew'), `${verb} pookie.eth for 10 days`),
    ).toBeNull()
  })

  it('asks which target to use and never silently chooses the first alternative', () => {
    const parsed = parseJevAiResponse(
      response('set_primary', { target_name: choice('name_1') }),
      'set alice.eth or bob.eth as primary',
    )
    if (!parsed) throw new Error('Expected a primary-name draft')
    expect(parsed.action).toMatchObject({
      intent: 'set_primary',
      name: undefined,
      nameCandidates: ['alice.eth', 'bob.eth'],
    })
    expect(prepareAiHandoff(parsed.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(prepareAiDetail(parsed.action, {}, 'name', 'bob.eth')).toMatchObject(
      {
        status: 'accepted',
        preparation: { status: 'ready', action: { name: 'bob.eth' } },
      },
    )
    expect(
      prepareAiDetail(parsed.action, {}, 'name', 'mallory.eth'),
    ).toMatchObject({ status: 'invalid' })
  })

  it.each([
    ['mute favourite expiry reminders', 'favouritedNameExpiry', false],
    ['unmute owned expiry reminders', 'ownedNameExpiry', true],
    ['stop sending ENS Labs updates', 'ensLabsUpdates', false],
  ] as const)('preserves the notification switch for %s', (query, preference, enabled) => {
    const result = parseJevAiResponse(response('notification'), query)
    expect(result?.action).toEqual({
      intent: 'notification',
      preference,
      enabled,
    })
  })

  it('never defaults an unspecified notification change to enabled', () => {
    const result = parseJevAiResponse(
      response('notification'),
      'change my favourite expiry reminders',
    )
    if (!result) throw new Error('Expected a preference draft')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'notificationEnabled',
    })
    expect(
      prepareAiDetail(result.action, {}, 'notificationEnabled', 'off'),
    ).toMatchObject({
      preparation: { status: 'ready', action: { enabled: false } },
    })
  })

  it('keeps a valid misspelled name exactly as typed', () => {
    expect(
      parseJevAiResponse(response('view_name'), 'show pookei.eth')?.action,
    ).toEqual({ intent: 'view_name', name: 'pookei.eth' })
  })
})
