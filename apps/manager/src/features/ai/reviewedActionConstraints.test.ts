import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})

const response = (intent: string, overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    intent: choice(intent),
    next_intent: choice('none'),
    request_mode: choice('requested'),
    action_count: choice('one'),
    manager_action: choice('none'),
    manager_constraints: choice('represented'),
    manager_locale: choice('missing'),
    manager_approval: choice('missing'),
    manager_notification_scope: choice('all'),
    manager_unread: choice('no'),
    manager_wallet_target: choice('missing'),
    manager_share_target: choice('missing'),
    renewal_target: choice('wallet_set'),
    selection_constraints: choice('represented'),
    migration_constraints: choice('represented'),
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

// Captured from the one requested live browser diagnostic; probability maps
// are omitted because parsing only reads the selected answer and confidence.
const observedRenewalResponse = {
  answers: {
    search_shape: choice('conjunction', 0.99),
    expiry_window: choice('positive_days', 0.65),
    fully_supported: { type: 'noul', noul: 0.88 },
    unsupported_requirement: { type: 'noul', noul: 0.22 },
    expiry: choice('any', 0.4),
    role: choice('any', 0.94),
    version: choice('v2', 1),
    upgrade: choice('any', 0.94),
    favorite: choice('any', 0.99),
    primary: choice('any', 0.96),
    sort: choice('any', 0.99),
    request_mode: choice('requested', 1),
    action_count: choice('one', 0.75),
    duration_unit: choice('days', 1),
    duration_purpose: choice('added', 0.96),
    duration_amount: choice('amount_1', 0.99),
    notification_preference: choice('ownedNameExpiry', 0.59),
    notification_operation: choice('unclear', 0.64),
    profile_field: choice('none', 0.33),
    profile_network: choice('unknown', 0.1),
    profile_operation: choice('none', 0.23),
    profile_value: choice('none', 1),
    profile_previous_value: choice('none', 1),
    manager_share_target: choice('missing', 0.82),
    manager_wallet_target: choice('missing', 0.79),
    manager_constraints: choice('unsupported', 0.91),
    manager_action: choice('none', 0.81),
    manager_approval: choice('missing', 0.51),
    manager_locale: choice('missing', 0.43),
    manager_notification_scope: choice('unsupported', 0.36),
    manager_unread: choice('no', 0.93),
    intent: choice('renew', 0.97),
    selection_constraints: choice('represented', 0.55),
    migration_constraints: choice('unsupported', 0.34),
    renewal_target: choice('wallet_set', 0.95),
    multi_action: { type: 'noul', noul: 0.07 },
    next_intent: choice('none', 0.94),
  },
}

const prepare = (
  query: string,
  intent: string,
  overrides: Record<string, unknown> = {},
) => {
  const interpretation = parseJevAiResponse(response(intent, overrides), query)
  return interpretation && prepareAiHandoff(interpretation.action)
}

describe('reviewed action and constraint regressions', () => {
  it.each([
    choice('many', 0.4),
    choice('many', 0),
    choice('one'),
  ])('does not silently drop a third explicit action: %j', (action_count) => {
    expect(
      prepare(
        'Register pookie.eth for 30 days and then set it as primary and then favorite it',
        'register',
        {
          action_count,
          multi_action: { type: 'noul', noul: 0.96 },
          next_intent: choice('set_primary'),
        },
      ),
    ).toBeNull()
  })

  it.each([
    null,
    { type: 'choice', choice: 'one', confidence: Number.NaN },
    choice('many', -1),
    choice('one', 2),
  ])('rejects malformed action-count evidence: %j', (action_count) => {
    expect(prepare('Show pookie.eth', 'view_name', { action_count })).toBeNull()
  })

  it('does not discard a low-confidence many warning without explicit then separators', () => {
    expect(
      prepare(
        'Register pookie.eth for 30 days and set it as primary and favorite it',
        'register',
        {
          action_count: choice('many', 0.4),
          multi_action: { type: 'noul', noul: 0.96 },
          next_intent: choice('set_primary'),
        },
      ),
    ).toBeNull()
  })

  it.each([
    [
      'Renew CEDAR.eth and birch.eth for 84 days',
      'renew',
      { durationDays: 84 },
    ],
    [
      'Migrate cedar.eth and birch.eth',
      'migrate',
      { excludeManagerRestoration: false },
    ],
  ] as const)('keeps multiple exact names in one complete operation: %s', (query, intent, details) => {
    expect(
      prepare(query, intent, { action_count: choice('two', 0.31) }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: intent === 'renew' ? 'bulk_renew' : 'migrate',
        ...(intent === 'renew' && { filters: {} }),
        names: ['cedar.eth', 'birch.eth'],
        ...details,
      },
    })
  })

  it('recognizes a plural favourites collection even without the word names', () => {
    expect(
      prepare('Renew all my favourites for one year', 'renew', {
        favorite: choice('yes'),
        renewal_target: choice('unclear', 0.34),
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { favorite: 'yes' },
        durationYears: 1,
      },
    })
  })

  it('keeps both selected-name references and their requested added duration', () => {
    const result = parseJevAiResponse(
      response('renew'),
      'Renew those selected names for 84 days',
    )
    expect(result?.action).toEqual({
      intent: 'bulk_renew',
      filters: {},
      referencedSelection: true,
      durationDays: 84,
    })
    if (!result) throw new Error('Expected a referenced selection')
    expect(
      prepareAiHandoff(result.action, {
        lastNames: ['cedar.eth'],
        lastFilters: { version: 'v2' },
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['cedar.eth'],
        filters: { version: 'v2' },
        durationDays: 84,
      },
    })
  })

  it('recognizes a complete request for every name in this wallet', () => {
    expect(prepare('Display every name in this wallet', 'find_names')).toEqual({
      status: 'ready',
      action: { intent: 'find_names', filters: {} },
    })
  })

  it('keeps restoration exclusions on a literal migration command with a weak requested-mode vote', () => {
    expect(
      prepare(
        'Upgrade my eligible V1 names without names needing manager restoration',
        'migrate',
        { request_mode: choice('requested', 0.38) },
      ),
    ).toEqual({
      status: 'ready',
      action: { intent: 'migrate', excludeManagerRestoration: true },
    })
  })

  it.each([
    'negated',
    'unclear',
  ])('preserves explicit %s migration polarity', (mode) => {
    expect(
      prepare(
        'Upgrade my eligible V1 names without names needing manager restoration',
        'migrate',
        { request_mode: choice(mode) },
      ),
    ).toBeNull()
  })

  it('does not use literal migration polarity to accept an unsupported subset', () => {
    expect(
      prepare('Upgrade my V1 favorites', 'migrate', {
        request_mode: choice('requested', 0.38),
      }),
    ).toBeNull()
  })

  it('uses a requested wallet primary name as a selection, without inventing an exact name', () => {
    expect(
      prepare('Renew my primary name for 69 days', 'renew', {
        primary: choice('yes'),
        renewal_target: choice('unclear', 0.3),
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { primary: 'yes' },
        durationDays: 69,
      },
    })
  })

  it('separates written expiry days from the added renewal period', () => {
    expect(
      prepare(
        'Renew my V2 names expiring within forty-five days for two years',
        'renew',
        {
          version: choice('v2'),
          expiry: choice('expiring'),
          expiry_window: choice('positive_days'),
          duration_purpose: choice('added'),
        },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { version: 'v2', expiry: 'expiring', withinDays: 45 },
        durationYears: 2,
      },
    })
  })

  describe('the captured explicit V2 renewal request', () => {
    const query = 'Renew my V2 names for 69 days'
    const replay = (overrides: Record<string, unknown> = {}, prompt = query) =>
      parseJevAiResponse(
        {
          answers: { ...observedRenewalResponse.answers, ...overrides },
        },
        prompt,
      )

    it('uses the complete exact selection and preserves all 69 additional days', () => {
      const interpretation = replay()
      expect(interpretation?.action).toEqual({
        intent: 'bulk_renew',
        filters: { version: 'v2' },
        durationDays: 69,
      })
      if (!interpretation)
        throw new Error('Expected the exact renewal selection')
      expect(prepareAiHandoff(interpretation.action)).toEqual({
        status: 'ready',
        action: {
          intent: 'bulk_renew',
          filters: { version: 'v2' },
          durationDays: 69,
        },
      })
    })

    it.each([
      { version: choice('v1') },
      { role: choice('owner') },
      { favorite: choice('yes') },
      { expiry: choice('expiring') },
    ])('rejects model facets that disagree with the exact selection: %j', (answers) => {
      expect(replay(answers)).toBeNull()
    })

    it.each([
      'Renew my V2 names for 69 days except favorites',
      'Renew my V2 names for 69 days if the price is below one dollar',
      'Renew my names for 69 days',
    ])('does not accept a different or extra selection condition: %s', (prompt) => {
      expect(replay({}, prompt)).toBeNull()
    })

    it.each([
      choice('unsupported'),
      choice('represented', Number.NaN),
      choice('represented', -0.1),
      choice('represented', 1.1),
      { type: 'text', value: 'represented' },
      null,
    ])('does not repair an unsupported or malformed constraint answer: %j', (assessment) => {
      expect(replay({ selection_constraints: assessment })).toBeNull()
    })

    it.each([
      { fully_supported: { type: 'noul', noul: 0.01 } },
      { unsupported_requirement: { type: 'noul', noul: 0.99 } },
      { request_mode: choice('negated') },
    ])('preserves the other interpretation gates: %j', (answers) => {
      expect(replay(answers)).toBeNull()
    })
  })

  describe('conflicting instructions after a recognized command', () => {
    it.each([
      'unclear',
      'negated',
    ])('keeps an explicit %s model warning for an email removal reversal', (mode) => {
      expect(
        prepare(
          'Remove my notification email, actually leave it connected',
          'manager_action',
          {
            manager_action: choice('email_remove'),
            request_mode: choice(mode),
          },
        ),
      ).toBeNull()
    })

    it.each([
      'unclear',
      'negated',
    ])('keeps an explicit %s model warning for a notification reversal', (mode) => {
      expect(
        prepare(
          'Turn off news notifications, actually leave them as they are',
          'notification',
          {
            request_mode: choice(mode),
            notification_preference: choice('ensLabsUpdates'),
            notification_operation: choice('disable'),
          },
        ),
      ).toBeNull()
    })

    it('still prepares an affirmative notification email removal', () => {
      expect(
        prepare('Remove my notification email', 'manager_action', {
          manager_action: choice('email_remove'),
        }),
      ).toEqual({
        status: 'ready',
        action: { intent: 'manager_action', kind: 'email_remove' },
      })
    })

    it('still prepares an affirmative request to stop news notifications', () => {
      expect(
        prepare('Turn off news notifications', 'notification', {
          notification_preference: choice('ensLabsUpdates'),
          notification_operation: choice('disable'),
        }),
      ).toEqual({
        status: 'ready',
        action: {
          intent: 'notification',
          preference: 'ensLabsUpdates',
          enabled: false,
        },
      })
    })
  })

  describe('native Manager context cannot replace another requested action', () => {
    it('keeps the news preference distinct from the browser push switch', () => {
      expect(
        prepare('Turn off news notifications', 'notification', {
          manager_action: choice('push_disable'),
          notification_preference: choice('ensLabsUpdates'),
          notification_operation: choice('disable'),
        }),
      ).toEqual({
        status: 'ready',
        action: {
          intent: 'notification',
          preference: 'ensLabsUpdates',
          enabled: false,
        },
      })
    })

    it('keeps a renewal of favourites distinct from opening the favourites tab', () => {
      expect(
        prepare('Renew my favorite names', 'renew', {
          manager_action: choice('show_favorites'),
          favorite: choice('yes'),
        }),
      ).toEqual({
        status: 'ready',
        action: { intent: 'bulk_renew', filters: { favorite: 'yes' } },
      })
    })

    it('keeps a confident wallet selection when favourites is the collection noun', () => {
      expect(
        prepare('Renew my favourites', 'renew', {
          renewal_target: choice('wallet_set'),
          favorite: choice('yes'),
        }),
      ).toEqual({
        status: 'ready',
        action: { intent: 'bulk_renew', filters: { favorite: 'yes' } },
      })
      expect(
        prepare('Renew all my V2 favorites', 'renew', {
          renewal_target: choice('wallet_set'),
          favorite: choice('yes'),
          version: choice('v2'),
        }),
      ).toEqual({
        status: 'ready',
        action: {
          intent: 'bulk_renew',
          filters: { favorite: 'yes', version: 'v2' },
        },
      })
    })

    it('still permits an explicit request for the browser push switch', () => {
      expect(
        prepare('Disable browser push notifications', 'manager_action', {
          manager_action: choice('push_disable'),
        }),
      ).toEqual({
        status: 'ready',
        action: { intent: 'manager_action', kind: 'push_disable' },
      })
    })

    it('still permits explicit navigation to the favourites tab', () => {
      expect(
        prepare('Open the favorites tab', 'manager_action', {
          manager_action: choice('show_favorites'),
        }),
      ).toEqual({
        status: 'ready',
        action: { intent: 'manager_action', kind: 'show_favorites' },
      })
    })
  })

  describe('migration must preserve the complete requested subset', () => {
    it.each([
      'Upgrade my eligible names to ENSv2',
      'Start the migration for names eligible for ENSv2',
    ])('recognizes V2 as the migration destination: %s', (query) => {
      expect(prepare(query, 'migrate')).toEqual({
        status: 'ready',
        action: { intent: 'migrate', excludeManagerRestoration: false },
      })
    })

    it('rejects an already-V2 source subset even when the model reports full support', () => {
      expect(prepare('Upgrade my V2 names', 'migrate')).toBeNull()
    })

    it.each([
      choice('unsupported'),
      choice('represented', 0.4),
      choice('represented', Number.NaN),
      { type: 'text', value: 'represented' },
    ])('rejects an unsupported, uncertain or malformed constraint assessment: %j', (assessment) => {
      expect(
        prepare('Upgrade eligible names', 'migrate', {
          migration_constraints: assessment,
        }),
      ).toBeNull()
    })

    it.each([
      'Upgrade favorite names without manager restoration',
      'Upgrade names needing manager restoration except favorites',
      'Upgrade names expiring within 45 days without manager restoration',
      'Upgrade orbit.eth and skip fern.eth without manager restoration',
      'Upgrade orbit.eth and omit fern.eth without manager restoration',
    ])('rejects an unrepresented or misbound migration constraint: %s', (query) => {
      expect(prepare(query, 'migrate')).toBeNull()
    })

    it('preserves an exact positive name list and its restoration exclusion', () => {
      expect(
        prepare(
          'Upgrade orbit.eth and fern.eth without manager restoration',
          'migrate',
        ),
      ).toEqual({
        status: 'ready',
        action: {
          intent: 'migrate',
          names: ['orbit.eth', 'fern.eth'],
          excludeManagerRestoration: true,
        },
      })
    })

    it('preserves a plain restoration exclusion without restricting the target list', () => {
      expect(
        prepare('Upgrade eligible names; skip manager restoration', 'migrate'),
      ).toEqual({
        status: 'ready',
        action: { intent: 'migrate', excludeManagerRestoration: true },
      })
    })
  })
})
