import { describe, expect, it } from 'vitest'
import {
  buildJevAiRequest,
  extractEnsNames,
  parseActionDuration,
  parseJevAiResponse,
  redactAiQuery,
} from './intent'

const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
})

const response = (intent: string, overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    multi_action: { type: 'noul', noul: 0.05 },
    intent: choice(intent),
    next_intent: choice('none'),
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

describe('AI intent boundary', () => {
  it('redacts exact names, URLs, emails, and addresses before Jev', () => {
    const query =
      'Add https://github.com/yoginth to yoginth.eth for 0x000000000000000000000000000000000000dead; email me@example.com'
    expect(extractEnsNames(query)).toEqual(['yoginth.eth'])
    expect(extractEnsNames('add github.com to yoginth.eth')).toEqual([
      'yoginth.eth',
      'github.com',
    ])
    const state = buildJevAiRequest(query).state
    expect(state).toContain('[ENS_NAME]')
    expect(state).toContain('[URL]')
    expect(state).toContain('[ADDRESS]')
    expect(state).toContain('[EMAIL]')
    expect(state).not.toContain('yoginth.eth')
    expect(state).not.toContain('0x0000')
    expect(redactAiQuery('set alice.eth primary')).toBe(
      'set [ENS_NAME] primary',
    )
    expect(extractEnsNames('set 😎.eth as primary')).toEqual(['😎.eth'])
    expect(redactAiQuery('set 😎.eth as primary')).toBe(
      'set [ENS_NAME] as primary',
    )
  })

  it('extracts a primary action and exact ENS name without model-provided routes', () => {
    expect(
      parseJevAiResponse(
        response('set_primary'),
        'set yoginth.eth as primary name',
      ),
    ).toEqual({
      status: 'ok',
      action: { intent: 'set_primary', name: 'yoginth.eth' },
    })
  })

  it('preserves day registration and year renewal durations', () => {
    expect(parseActionDuration('for 69 days')).toEqual({ durationDays: 69 })
    expect(parseActionDuration('for two years')).toEqual({ durationYears: 2 })
    expect(parseActionDuration('within 45 days')).toBeNull()
    expect(parseActionDuration('in 45 days')).toBeNull()
    expect(
      parseJevAiResponse(
        response('register'),
        'register yoginth.eth for 69 days',
      )?.action,
    ).toEqual({
      intent: 'register',
      name: 'yoginth.eth',
      durationDays: 69,
    })
    expect(
      parseJevAiResponse(response('renew'), 'renew alice.eth for two years')
        ?.action,
    ).toEqual({
      intent: 'renew',
      name: 'alice.eth',
      durationYears: 2,
    })
    expect(
      parseJevAiResponse(
        response('register'),
        'register alice.eth for 27 days',
      ),
    ).toBeNull()
    expect(parseActionDuration('for 2 months')).toBeNull()
    expect(
      parseJevAiResponse(
        response('register'),
        'register alice.eth within 45 days',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(response('renew'), 'renew alice.eth after two years'),
    ).toBeNull()
  })

  it('keeps dashboard search facets and arbitrary expiry days', () => {
    expect(
      parseJevAiResponse(
        response('find_names', {
          fully_supported: { type: 'noul', noul: 0.25 },
          unsupported_requirement: { type: 'noul', noul: 0.29 },
          expiry: choice('expiring'),
          role: choice('manager', 0.49),
        }),
        'show my manager names expiring within 45 days',
      )?.action,
    ).toEqual({
      intent: 'find_names',
      filters: { expiry: 'expiring', withinDays: 45, role: 'manager' },
    })
    expect(
      parseJevAiResponse(response('bulk_renew'), 'renew those names')?.action,
    ).toEqual({ intent: 'bulk_renew', filters: {}, referencedSelection: true })
    expect(
      parseJevAiResponse(
        response('renew', {
          intent: choice('renew', 0.36),
          fully_supported: { type: 'noul', noul: 0.62 },
          unsupported_requirement: { type: 'noul', noul: 0.31 },
        }),
        'Renew those names',
      )?.action,
    ).toEqual({ intent: 'bulk_renew', filters: {}, referencedSelection: true })
    expect(
      parseJevAiResponse(
        response('bulk_renew', {
          fully_supported: { type: 'noul', noul: 0.39 },
          unsupported_requirement: { type: 'noul', noul: 0.38 },
          expiry: choice('expiring'),
          role: choice('manager', 0.5),
        }),
        'Renew my manager names expiring within 45 days',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'expiring', withinDays: 45, role: 'manager' },
    })
    expect(
      parseJevAiResponse(
        response('renew', { intent: choice('renew', 0.36) }),
        'Renew those names and transfer alice.eth',
      ),
    ).toBeNull()
  })

  it('rejects unsupported, uncertain, and custom reminder requests', () => {
    expect(
      parseJevAiResponse(
        response('register', {
          unsupported_requirement: { type: 'noul', noul: 0.91 },
        }),
        'register alice.eth and delete bob.eth',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('register', {
          fully_supported: { type: 'noul', noul: 0.54 },
          unsupported_requirement: { type: 'noul', noul: 0.51 },
        }),
        'register alice.eth for 69 days',
      )?.action,
    ).toEqual({ intent: 'register', name: 'alice.eth', durationDays: 69 })
    expect(
      parseJevAiResponse(
        response('register'),
        'register alice.eth and transfer bob.eth',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('set_primary', { intent: choice('set_primary', 0.2) }),
        'set alice.eth primary',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('notification'),
        'remind me 14 days before alice.eth expires',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(response('notification'), 'remind me in 14 days'),
    ).toBeNull()
  })

  it('offers only the first of two supported actions', () => {
    expect(
      parseJevAiResponse(
        response('register', {
          multi_action: { type: 'noul', noul: 0.95 },
          next_intent: choice('set_primary'),
        }),
        'register yoginth.eth for 69 days, then set it as primary',
      ),
    ).toEqual({
      status: 'ok',
      action: { intent: 'register', name: 'yoginth.eth', durationDays: 69 },
      multiAction: { nextIntent: 'set_primary' },
    })
    expect(
      parseJevAiResponse(
        response('register', {
          fully_supported: { type: 'noul', noul: 0.56 },
          unsupported_requirement: { type: 'noul', noul: 0.52 },
          multi_action: { type: 'noul', noul: 0.97 },
          next_intent: choice('set_primary'),
        }),
        'register yoginth.eth for 69 days and then set it as primary',
      ),
    ).toEqual({
      status: 'ok',
      action: { intent: 'register', name: 'yoginth.eth', durationDays: 69 },
      multiAction: { nextIntent: 'set_primary' },
    })
    expect(
      parseJevAiResponse(
        response('register', {
          fully_supported: { type: 'noul', noul: 0.56 },
          unsupported_requirement: { type: 'noul', noul: 0.52 },
          multi_action: { type: 'noul', noul: 0.97 },
          next_intent: choice('renew'),
        }),
        'register yoginth.eth for 69 days and then set it as primary',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('register', {
          fully_supported: { type: 'noul', noul: 0.56 },
          unsupported_requirement: { type: 'noul', noul: 0.52 },
          multi_action: { type: 'noul', noul: 0.97 },
          next_intent: choice('set_primary'),
        }),
        'register yoginth.eth for 69 days and then set it as primary and transfer alice.eth',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('register'),
        'register yoginth.eth for 69 days, then set it as primary',
      ),
    ).toBeNull()
  })

  it('extracts migration exclusion, profile section, and notification switch', () => {
    expect(
      parseJevAiResponse(
        response('migrate', {
          fully_supported: { type: 'noul', noul: 0.49 },
          unsupported_requirement: { type: 'noul', noul: 0.49 },
          upgrade: choice('eligible', 0.96),
          version: choice('v1', 0.48),
        }),
        'upgrade eligible V1 names except ones needing manager restoration',
      )?.action,
    ).toEqual({ intent: 'migrate', excludeManagerRestoration: true })
    expect(
      parseJevAiResponse(
        response('migrate'),
        'upgrade eligible V1 names except ones needing manager restoration and transfer alice.eth',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('edit_profile'),
        'add my GitHub to yoginth.eth',
      )?.action,
    ).toEqual({ intent: 'edit_profile', name: 'yoginth.eth', section: 'links' })
    expect(
      parseJevAiResponse(
        response('notification'),
        'turn on favourite expiry reminders',
      )?.action,
    ).toEqual({
      intent: 'notification',
      preference: 'favouritedNameExpiry',
      enabled: true,
    })
  })
})
