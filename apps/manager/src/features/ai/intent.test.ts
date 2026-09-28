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
    selection_constraints: choice('represented'),
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
  it('does not confuse a word inside an exact name with an unsupported operation', () => {
    expect(
      parseJevAiResponse(response('view_name'), 'Show mint-tea.eth')?.action,
    ).toEqual({ intent: 'view_name', name: 'mint-tea.eth' })
    expect(
      parseJevAiResponse(response('renew'), 'Renew mint-tea.eth for 45 days')
        ?.action,
    ).toMatchObject({ intent: 'renew', name: 'mint-tea.eth', durationDays: 45 })
  })
  it.each([
    'skip manager restoration',
    'leave out anything that needs manager restoration',
    'except those requiring their manager restored',
  ])('preserves migration exclusion %s', (exclusion) => {
    expect(
      parseJevAiResponse(
        response('migrate'),
        `Upgrade eligible names; ${exclusion}`,
      )?.action,
    ).toEqual({ intent: 'migrate', excludeManagerRestoration: true })
  })
  it('keeps app language readable while redacting exact profile values', () => {
    expect(buildJevAiRequest('Change app langauge to Svenska').state).toContain(
      'Svenska',
    )
    expect(
      buildJevAiRequest('Set alice.eth profile language to Swedish').state,
    ).not.toContain('Swedish')
  })
  it('does not silently turn a misspelled sharing request into viewing', () => {
    expect(
      parseJevAiResponse(response('view_name'), 'shrae meadow.eth profile'),
    ).toBeNull()
  })

  it('rejects a mixed owner question even when the model selects renewal', () => {
    expect(
      parseJevAiResponse(
        response('renew', {
          manager_action: choice('view_profile_owner'),
          action_count: choice('two', 0.69),
          renewal_target: choice('one', 0.74),
          duration_unit: choice('missing'),
        }),
        'Who owns willow.eth and renew it?',
      ),
    ).toBeNull()
  })

  it.each([
    'Show all my names',
    'List my names',
    'Show names in my wallet',
  ])('supports the complete wallet set without inventing a filter: %s', (query) => {
    expect(parseJevAiResponse(response('find_names'), query)?.action).toEqual({
      intent: 'find_names',
      filters: {},
      allNames: true,
    })
  })

  it('does not drop an unrepresented condition from a whole-wallet request', () => {
    expect(
      parseJevAiResponse(
        response('find_names'),
        'Show all my names with animal meanings',
      ),
    ).toBeNull()
  })

  it('uses literal plural scope without weakening exact-name selection', () => {
    expect(
      parseJevAiResponse(
        response('renew', {
          renewal_target: choice('wallet_set', 0.53),
          expiry: choice('expiring'),
        }),
        'Renew my names expiring within 45 days',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'expiring', withinDays: 45 },
    })
  })
  it('asks for renewal scope separately from the operation', () => {
    const request = buildJevAiRequest('Renew my owned names in grace')
    expect(request.questions.intent.criteria).toHaveProperty('renew')
    expect(request.questions.intent.criteria).not.toHaveProperty('bulk_renew')
    expect(request.questions.renewal_target.criteria).toHaveProperty(
      'wallet_set',
    )
    expect(
      parseJevAiResponse(
        response('renew', {
          renewal_target: choice('wallet_set'),
          expiry: choice('in-grace'),
          role: choice('owner'),
        }),
        'Renew my owned names in grace',
      ),
    ).toEqual({
      status: 'ok',
      action: {
        intent: 'bulk_renew',
        filters: { role: 'owner', expiry: 'in-grace' },
      },
    })
  })

  it('does not silently turn an exact list or uncertain scope into one renewal', () => {
    for (const target of [choice('exact_list'), choice('wallet_set', 0.3)]) {
      expect(
        parseJevAiResponse(
          response('renew', {
            renewal_target: target,
            selection_constraints: undefined,
          }),
          'Renew alice.eth and bob.eth for two years',
        ),
      ).toBeNull()
    }
  })

  it('retains targeted clarification for an incomplete singular renewal', () => {
    expect(
      parseJevAiResponse(
        response('renew', { renewal_target: choice('one') }),
        'Renew for two years',
      )?.action,
    ).toEqual({ intent: 'renew', durationYears: 2 })
  })

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
    const valueIds = state.match(/\[PROFILE_VALUE_\d+\]/g) ?? []
    expect(valueIds).toHaveLength(3)
    expect(new Set(valueIds).size).toBe(3)
    for (const literal of [
      'https://github.com/yoginth',
      'yoginth.eth',
      '0x0000',
      'me@example.com',
    ])
      expect(state).not.toContain(literal)
    expect(redactAiQuery('set alice.eth primary')).toBe(
      'set [ENS_NAME] primary',
    )
    expect(extractEnsNames('set 😎.eth as primary')).toEqual(['😎.eth'])
    expect(redactAiQuery('set 😎.eth as primary')).toBe(
      'set [ENS_NAME] as primary',
    )
    expect(redactAiQuery('set @alice.eth as primary')).toBe(
      'set @[ENS_NAME] as primary',
    )
    expect(redactAiQuery('set alice.eth@ as primary')).toBe(
      'set [ENS_NAME]@ as primary',
    )
    expect(redactAiQuery('show /alice.eth')).toBe('show /[ENS_NAME]')
    expect(redactAiQuery('show alice.eth/profile')).toBe('show [URL]')
    expect(redactAiQuery('show alice.eth/bob.eth')).toBe('show [URL]')
    expect(redactAiQuery('add github.com/yoginth')).toBe('add [URL]')
    expect(redactAiQuery('add ipfs://bafybeigdyrzt')).toBe('add [URL]')
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

  it.each([
    'extend pookie.eth for another 10 days',
    'Extend pookie.eth for another ten days',
    'extend pookie.eth by 10 days',
    'renew pookie.eth for an additional 10 days',
    'renew pookie.eth for an extra 10 days',
  ])('preserves an additional renewal duration: %s', (query) => {
    expect(parseJevAiResponse(response('renew'), query)).toEqual({
      status: 'ok',
      action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
    })
  })

  it('keeps duration units and rejects deadlines or ambiguous extension amounts', () => {
    expect(
      parseActionDuration('extend pookie.eth for another two weeks', 'renew'),
    ).toEqual({ durationDays: 14 })
    expect(
      parseActionDuration('extend pookie.eth by two years', 'renew'),
    ).toEqual({ durationYears: 2 })
    for (const query of [
      'extend pookie.eth in 10 days',
      'extend pookie.eth within 10 days',
      'extend pookie.eth after 10 days',
      'extend pookie.eth for another 0 days',
      'extend pookie.eth for another -10 days',
      'extend pookie.eth for another 1.5 days',
      'extend pookie.eth for another 10 days and 2 weeks',
      'extend pookie.eth for another two months',
    ]) {
      expect(parseJevAiResponse(response('renew'), query)).toBeNull()
    }
    expect(parseActionDuration('register pookie.eth by 30 days')).toBeNull()
  })

  it('interprets grace period list requests using dashboard expiry rules', () => {
    for (const query of [
      'list all grace period names',
      'show my names in grace',
    ]) {
      expect(
        parseJevAiResponse(
          response('find_names', {
            fully_supported: { type: 'noul', noul: 0.25 },
            unsupported_requirement: { type: 'noul', noul: 0.29 },
          }),
          query,
        )?.action,
      ).toEqual({
        intent: 'find_names',
        filters: { expiry: 'in-grace' },
      })
    }
    expect(
      parseJevAiResponse(
        response('find_names', { expiry: choice('past-grace') }),
        'list all names past grace period',
      )?.action,
    ).toEqual({
      intent: 'find_names',
      filters: { expiry: 'past-grace' },
    })
  })

  it('accepts observed Jev grace and manager decisions without overriding unsupported intent', () => {
    // Before the questions described grace filters, the live model classified
    // this supported request as unsupported. Keep rejecting that response;
    // the prompt contract must make the supported intent unambiguous.
    expect(
      parseJevAiResponse(
        response('unsupported', {
          fully_supported: { type: 'noul', noul: 0.31 },
          unsupported_requirement: { type: 'noul', noul: 0.81 },
          intent: choice('unsupported', 0.54),
          expiry: choice('any', 0.92),
        }),
        'List all grace period names',
      ),
    ).toBeNull()

    expect(
      parseJevAiResponse(
        response('find_names', {
          fully_supported: { type: 'noul', noul: 0.79 },
          unsupported_requirement: { type: 'noul', noul: 0.16 },
          intent: choice('find_names', 1),
          expiry: choice('in-grace', 1),
          next_intent: choice('none', 0.93),
        }),
        'List all grace period names',
      ),
    ).toEqual({
      status: 'ok',
      action: { intent: 'find_names', filters: { expiry: 'in-grace' } },
    })
    expect(
      parseJevAiResponse(
        response('find_names', {
          fully_supported: { type: 'noul', noul: 0.84 },
          unsupported_requirement: { type: 'noul', noul: 0.1 },
          intent: choice('find_names', 1),
          role: choice('manager', 0.97),
          multi_action: { type: 'noul', noul: 0.04 },
          next_intent: choice('none', 0.97),
        }),
        'Show my manager names',
      )?.action,
    ).toEqual({ intent: 'find_names', filters: { role: 'manager' } })
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

  it('rejects incomplete name facets and unsupported referenced constraints', () => {
    expect(
      parseJevAiResponse(
        response('find_names', { role: choice('unknown') }),
        'show my manager names expiring within 45 days',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('find_names', { intent: choice('find_names', 0.2) }),
        'show my manager names expiring within 45 days',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(response('find_names'), 'show my names'),
    ).toMatchObject({
      status: 'ok',
      action: { intent: 'find_names', filters: {}, allNames: true },
    })
    expect(
      parseJevAiResponse(
        response('bulk_renew', { favorite: choice('unknown') }),
        'renew those names',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('bulk_renew'),
        'renew those names with a blue avatar',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('bulk_renew', { favorite: choice('no') }),
        'renew those names except favourites',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { favorite: 'no' },
      referencedSelection: true,
    })
    const observedSupport = (unsupportedRequirement: number) =>
      response('bulk_renew', {
        fully_supported: { type: 'noul', noul: 0.57 },
        unsupported_requirement: {
          type: 'noul',
          noul: unsupportedRequirement,
        },
        favorite: choice('no', 0.75),
        intent: choice('bulk_renew', 0.92),
        multi_action: { type: 'noul', noul: 0.1 },
        next_intent: choice('none', 0.69),
      })
    for (const unsupported of [0.56, 0.66]) {
      expect(
        parseJevAiResponse(
          observedSupport(unsupported),
          'Renew those names except favourites',
        )?.action,
      ).toEqual({
        intent: 'bulk_renew',
        filters: { favorite: 'no' },
        referencedSelection: true,
      })
    }
    expect(
      parseJevAiResponse(
        observedSupport(0.66),
        'Renew those names except favourites with a blue avatar',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        observedSupport(0.86),
        'Renew those names except favourites',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('bulk_renew', {
          ...observedSupport(0.66).answers,
          intent: choice('bulk_renew', 0.7),
        }),
        'Renew those names except favourites',
      ),
    ).toBeNull()
  })

  it('rejects unsupported, uncertain, and custom reminder requests', () => {
    expect(
      parseJevAiResponse(
        response('favorite'),
        'Favourite alice.eth and transfer it',
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response('notification'),
        'Turn on favourite expiry reminders every 7 days',
      ),
    ).toBeNull()
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
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'contact',
      field: 'github',
    })
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

  it('preserves explicit profile values and rejects unsupported field edits as a whole', () => {
    const request = buildJevAiRequest('Use Garnet theme for yoginth.eth')
    expect(request.state).toBe('Use [PROFILE_VALUE_1] theme for [ENS_NAME]')
    expect(request.questions.intent.criteria.edit_profile).toContain('theme')
    expect(request.questions.intent.instructions).toContain('edit_profile')
    expect(
      parseJevAiResponse(
        response('edit_profile'),
        'Set yoginth.eth description to "I build ENS tools"',
      )?.action,
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'general',
      field: 'description',
      value: 'I build ENS tools',
    })
    expect(
      parseJevAiResponse(
        response('edit_profile'),
        'Use Garnet theme for yoginth.eth',
      )?.action,
    ).toMatchObject({ section: 'appearance', field: 'theme', value: 'Garnet' })
    expect(
      parseJevAiResponse(
        response('edit_profile'),
        'Set profile name to Yogi on yoginth.eth',
      ),
    ).toMatchObject({
      action: { intent: 'edit_profile', field: 'display_name', value: 'Yogi' },
    })
    expect(
      parseJevAiResponse(
        response('edit_profile'),
        'Set my avatar and email on yoginth.eth',
      ),
    ).toBeNull()
  })

  it.each([
    'Favourite alice.eth',
    'Favorite ALICE.eth',
    'Star alice.eth',
  ])('preserves the exact favourite target after interpretation: %s', (query) => {
    expect(buildJevAiRequest(query).state).not.toMatch(/alice\.eth/i)
    expect(parseJevAiResponse(response('favorite'), query)).toEqual({
      status: 'ok',
      action: { intent: 'favorite', name: 'alice.eth' },
    })
  })
})
