import { describe, expect, it } from 'vitest'
import {
  buildJevNameSearchRequest,
  parseExplicitDayCount,
  parseJevNameSearchResponse,
} from './jevNameSearch'

const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
})

const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    expiry: choice('expiring'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
})

describe('Jev name search interpretation', () => {
  it.each([
    'Show V2 names that are neither favourites nor primary',
    'Show V2 names excluding both favourites and primary names',
    "Show V2 names that aren't either favourites or primary",
  ])('keeps shared negation as two required negative filters: %s', (query) => {
    const result = response({
      expiry: choice('any'),
      version: choice('v2'),
      favorite: choice('no'),
      primary: choice('no'),
      search_shape: choice('conjunction'),
      expiry_window: choice('none'),
    })
    expect(buildJevNameSearchRequest(query).state).toContain(
      'not favorites and not primary',
    )
    expect(parseJevNameSearchResponse(result, query)).toEqual({
      version: 'v2',
      favorite: 'no',
      primary: 'no',
    })
  })

  it.each([
    'Show neither favourites nor primary or names in grace',
    'Show not favourites or primary names',
    'Show favourites or primary names',
    'Show names that are neither owner nor manager',
    'Show names that are neither favourites nor active',
    'Show names that are neither favourites nor primary nor expired',
    'Show names not neither favourites nor primary',
    'Show names that are neither favourites nor primary with animal meanings',
  ])('does not normalize unsupported alternatives or properties: %s', (query) => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          favorite: choice('no'),
          primary: choice('no'),
          search_shape: choice('conjunction'),
          expiry_window: choice('none'),
        }),
        query,
      ),
    ).toBeNull()
  })

  it.each([
    { favorite: choice('yes') },
    { primary: choice('yes') },
    { favorite: choice('no', 0.1) },
    { primary: choice('no', Number.NaN) },
    { search_shape: choice('alternatives') },
    { unsupported_requirement: { type: 'noul', noul: 1 } },
  ])('preserves model disagreement and response validation for shared negation: %j', (overrides) => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          favorite: choice('no'),
          primary: choice('no'),
          search_shape: choice('conjunction'),
          expiry_window: choice('none'),
          ...overrides,
        }),
        'Show names that are neither favourites nor primary',
      ),
    ).toBeNull()
  })

  it.each([
    'eligible',
    'ineligible',
  ])('does not invent %s upgrade eligibility from V1 or grace status', (upgrade) => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('past-grace'),
          version: choice('v1'),
          upgrade: choice(upgrade),
        }),
        'v1 names outside their grace period after expiry',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('past-grace'),
          version: choice('v1'),
          favorite: choice('no'),
          upgrade: choice(upgrade),
        }),
        'find unstarred v1 names that have passed grace',
      ),
    ).toBeNull()
  })

  it('rejects an unrequested primary filter even when other facets are correct', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('active'),
          version: choice('v1'),
          primary: choice('yes', 0.48),
        }),
        'renwe my active v1 names',
      ),
    ).toBeNull()
  })
  it.each([
    ['favorites whose grace period is over', 'past-grace'],
    ['names outside grace that have already expired', 'past-grace'],
    ['names outside their grace period after expiry', 'past-grace'],
    ['names that have passed grace', 'past-grace'],
    ['names whose grace period has finished', 'past-grace'],
    ['names whose grace period has elapsed', 'past-grace'],
    ['names that do not expire', 'non-expiring'],
  ])('retains the expiry distinction in %s', (query, expiry) => {
    expect(
      parseJevNameSearchResponse(response({ expiry: choice(expiry) }), query),
    ).toMatchObject({ expiry })
  })

  it('does not reject a non-expiry search because the model is uncertain about an absent expiry window', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          version: choice('v1'),
          favorite: choice('yes'),
          sort: choice('expiry-asc'),
          expiry_window: choice('none', 0.48),
        }),
        'Show my V1 favorites, soonest expiry first',
      ),
    ).toEqual({ version: 'v1', favorite: 'yes', sort: 'expiry-asc' })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('in-grace'),
          expiry_window: choice('none', 0.48),
        }),
        'names in grace',
      ),
    ).toEqual({ expiry: 'in-grace' })
  })

  it('retains uncertainty rejection for a requested expiry window', () => {
    for (const expiry_window of [
      choice('positive_days', 0.48),
      choice('none', 0.48),
    ]) {
      expect(
        parseJevNameSearchResponse(
          response({ expiry_window }),
          'names expiring within 45 days',
        ),
      ).toBeNull()
    }
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          expiry_window: choice('none', 0.48),
        }),
        'names expiring in 45 days',
      ),
    ).toBeNull()
  })
  it.each([
    ['names in grace', 'in-grace'],
    ['List all grace period names', 'in-grace'],
    ['show my names past the grace period', 'past-grace'],
  ])('accepts a fully represented exact grace request despite a borderline global support score: %s', (query, expiry) => {
    expect(
      parseJevNameSearchResponse(
        response({
          fully_supported: { type: 'noul', noul: 0.27 },
          unsupported_requirement: { type: 'noul', noul: 0.41 },
          expiry: choice(expiry, 1),
          search_shape: choice('conjunction', 0.99),
          expiry_window: choice('none', 0.99),
        }),
        query,
      ),
    ).toEqual({ expiry })
  })

  it('keeps the general uncertainty gate for grace requests with extra or conflicting constraints', () => {
    const borderline = {
      fully_supported: { type: 'noul', noul: 0.27 },
      unsupported_requirement: { type: 'noul', noul: 0.41 },
      expiry: choice('in-grace', 1),
    }
    for (const query of [
      'names in grace about surfing',
      'names in grace within 10 days',
      'names in grace or expired',
      'names in grace except favourites',
    ]) {
      expect(parseJevNameSearchResponse(response(borderline), query)).toBeNull()
    }
    for (const overrides of [
      { expiry: choice('in-grace', 0.6) },
      { expiry: choice('past-grace', 1) },
      { primary: choice('yes', 1) },
      { fully_supported: { type: 'noul', noul: 0.1 } },
      { unsupported_requirement: { type: 'noul', noul: 0.8 } },
      { search_shape: choice('alternatives') },
    ]) {
      expect(
        parseJevNameSearchResponse(
          response({ ...borderline, ...overrides }),
          'names in grace',
        ),
      ).toBeNull()
    }
  })
  it.each([
    ['names not owned by me', { role: choice('owner') }],
    ['names I do not own', { role: choice('owner') }],
    ["names I don't manage", { role: choice('manager') }],
    ['names without manager permissions', { role: choice('manager') }],
    ['non-managed names', { role: choice('manager') }],
    ['names except v1', { version: choice('v1') }],
    ["names that aren't ENSv2", { version: choice('v2') }],
    ['names excluding ENS version 1', { version: choice('v1') }],
  ])('rejects unsupported negative roles or versions despite optimistic facets: %s', (query, facets) => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          search_shape: choice('conjunction'),
          expiry_window: choice('none'),
          ...(facets as Record<string, unknown>),
        }),
        query as string,
      ),
    ).toBeNull()
  })
  it('sends only the supplied query as state', () => {
    const request = buildJevNameSearchRequest('names expiring soon')
    expect(request.model).toBe('jev-latest')
    expect(request.state).toBe('names expiring soon')
    expect(Object.keys(request.questions)).toContain('fully_supported')
    expect(Object.keys(request.questions)).toContain('unsupported_requirement')
  })

  it('parses arbitrary positive day counts', () => {
    expect(parseExplicitDayCount('expiring within 45 days')).toBe(45)
    expect(parseExplicitDayCount('expiring in the next 123 days')).toBe(123)
    expect(parseExplicitDayCount('expiring soon')).toBeNull()
    expect(parseExplicitDayCount('expired 45 days ago')).toBe('invalid')
    expect(parseExplicitDayCount('within 0 days')).toBe('invalid')
  })

  it('accepts supported combined filters and a day count', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          role: choice('manager'),
          version: choice('v1'),
          upgrade: choice('eligible'),
          favorite: choice('yes'),
          sort: choice('expiry-asc'),
        }),
        'my favorite v1 manager names eligible for upgrade expiring within 45 days sorted by expiry',
      ),
    ).toEqual({
      expiry: 'expiring',
      withinDays: 45,
      role: 'manager',
      version: 'v1',
      upgrade: 'eligible',
      favorite: 'yes',
      sort: 'expiry-asc',
    })
  })

  it('rejects uncertain and partially unsupported interpretations', () => {
    expect(
      parseJevNameSearchResponse(
        response({ fully_supported: { type: 'noul', noul: 0.25 } }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('expiring', 0.3) }),
        'names approaching expiry',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any') }),
        'alice.eth',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ version: choice('v2'), upgrade: choice('eligible') }),
        'v2 names eligible for upgrade',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.95 },
        }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
  })

  it('accepts direct supported wording when global support is less certain', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          role: choice('manager', 0.58),
        }),
        'names I manage',
      ),
    ).toEqual({ role: 'manager' })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          primary: choice('any'),
        }),
        'primary name',
      ),
    ).toEqual({ primary: 'yes' })
    expect(
      parseJevNameSearchResponse(
        response({
          fully_supported: { type: 'noul', noul: 0.43 },
          expiry: choice('any'),
          favorite: choice('any'),
        }),
        'favorites',
      ),
    ).toEqual({ favorite: 'yes' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), sort: choice('expiry-asc') }),
        'sort by expiry',
      ),
    ).toEqual({ sort: 'expiry-asc' })
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.77 },
          expiry: choice('expiring'),
        }),
        'names expiring within 45 days',
      ),
    ).toEqual({ expiry: 'expiring', withinDays: 45 })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          favorite: choice('no'),
          primary: choice('any'),
        }),
        'not favorites',
      ),
    ).toEqual({ favorite: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), upgrade: choice('any') }),
        'which names can I upgrade?',
      ),
    ).toEqual({ upgrade: 'eligible' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), upgrade: choice('any') }),
        "names I can't upgrade",
      ),
    ).toEqual({ upgrade: 'ineligible' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), favorite: choice('any') }),
        'non-favorites',
      ),
    ).toEqual({ favorite: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), favorite: choice('no') }),
        'names except favourites',
      ),
    ).toEqual({ favorite: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), primary: choice('any') }),
        'non-primary names',
      ),
    ).toEqual({ primary: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), primary: choice('no') }),
        'names except my primary',
      ),
    ).toEqual({ primary: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any') }),
        'names about to expire',
      ),
    ).toEqual({ expiry: 'expiring' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('past-grace') }),
        'names whose grace period has ended',
      ),
    ).toEqual({ expiry: 'past-grace' })
  })

  it('fails closed when Jev misses a favorite or primary synonym', () => {
    expect(
      parseJevNameSearchResponse(
        response({ favorite: choice('any') }),
        'starred names expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ favorite: choice('any') }),
        'bookmarked names expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ primary: choice('any') }),
        'my main name expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ primary: choice('any') }),
        'reverse name expiring soon',
      ),
    ).toBeNull()
  })

  it('accepts explicit role and ENS version synonyms without dropping them', () => {
    expect(
      parseJevNameSearchResponse(
        response({ role: choice('any'), version: choice('any') }),
        'registrant ENS v1 names expiring soon',
      ),
    ).toEqual({ expiry: 'expiring', role: 'owner', version: 'v1' })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          role: choice('any'),
          version: choice('any'),
        }),
        'names I control on ENS version 2',
      ),
    ).toEqual({ role: 'manager', version: 'v2' })
  })

  it('rejects ambiguous role or version requests rather than applying only expiry', () => {
    expect(
      parseJevNameSearchResponse(response(), 'names with a role expiring soon'),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response(),
        'names from an ENS version expiring soon',
      ),
    ).toBeNull()
  })

  it('rejects a supported filter mixed with an unsupported request', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.1 },
        }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
  })

  it.each([
    ['show my favrites', { favorite: choice('yes') }, { favorite: 'yes' }],
    ['nams im managr of', { role: choice('manager') }, { role: 'manager' }],
    ['old ENS generation names', { version: choice('v1') }, { version: 'v1' }],
    ['my bookmarked names', { favorite: choice('yes') }, { favorite: 'yes' }],
    [
      'names with lapsed registration',
      { expiry: choice('expired') },
      { expiry: 'expired' },
    ],
    [
      'ready for the new ENS',
      { upgrade: choice('eligible') },
      { upgrade: 'eligible' },
    ],
    [
      'the name representing my wallet',
      { primary: choice('yes') },
      { primary: 'yes' },
    ],
  ])('preserves validated semantic facets for %s', (query, answers, filters) => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          search_shape: choice('conjunction'),
          expiry_window: choice('none'),
          ...answers,
        }),
        query as string,
      ),
    ).toEqual(filters)
  })

  it.each([
    'expiring 45 days from now',
    'expiring in 45 more days',
    'due within the next 45 days',
  ])('extracts the same literal day count from %s', (query) => {
    expect(parseExplicitDayCount(query)).toBe(45)
    expect(
      parseJevNameSearchResponse(
        response({
          search_shape: choice('conjunction'),
          expiry_window: choice('positive_days'),
        }),
        query,
      ),
    ).toEqual({ expiry: 'expiring', withinDays: 45 })
  })

  it('uses Jev only to identify the day unit and keeps the quantity in code', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          role: choice('manager'),
          version: choice('v1'),
          search_shape: choice('conjunction'),
          expiry_window: choice('positive_days'),
        }),
        'managr v1 names xpirng in 45 dys',
      ),
    ).toEqual({
      role: 'manager',
      version: 'v1',
      expiry: 'expiring',
      withinDays: 45,
    })
    expect(
      parseJevNameSearchResponse(
        response({ expiry_window: choice('positive_days') }),
        'names expiring in many dys',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ expiry_window: choice('positive_days') }),
        'expiring within 10 or 45 dys',
      ),
    ).toBeNull()
  })

  it.each([
    ['forty-five', 45],
    ['forty five', 45],
    ['one hundred and twenty', 120],
    ['one', 1],
  ])('extracts written expiry days without asking Jev to generate a number: %s', (amount, days) => {
    const query = `my V2 names expiring within ${amount} days`
    expect(parseExplicitDayCount(query)).toBe(days)
    expect(
      parseJevNameSearchResponse(
        response({
          version: choice('v2'),
          expiry_window: choice('positive_days'),
          search_shape: choice('conjunction'),
        }),
        query,
      ),
    ).toEqual({ expiry: 'expiring', withinDays: days, version: 'v2' })
  })

  it.each([
    'minus ten days',
    'negative forty-five days',
    '− ten days',
    'two three days',
    'one hundred and days',
    'twenty or forty days',
    'twenty or 40 days',
    '20 or forty days',
    'between ten and twenty days',
    'one and a half days',
    'two point five days',
    'one million days',
    'many days',
  ])('does not approximate ambiguous written expiry days: %s', (amount) => {
    expect(parseExplicitDayCount(`expiring within ${amount}`)).toBe('invalid')
    expect(
      parseJevNameSearchResponse(
        response({ expiry_window: choice('positive_days') }),
        `expiring within ${amount}`,
      ),
    ).toBeNull()
  })

  it.each([
    'in -10 days',
    'in minus 45 days',
    'in negative 45 days',
    'in −45 days',
    'in ﹣45 days',
    'in －45 days',
    'after forty-five days',
    'beyond forty-five days',
    'from ten days',
    'after 45 days',
    'beyond 45 days',
    'in +10 days',
    'in - 10 days',
    'in 1.5 days',
    'in 1,045 days',
    'between 10 and 20 days',
    'from 10 to 20 days',
    'more than 10 days',
    'at least 10 days',
    '10 days ago',
    'in 0 days',
    'in 9007199254740992 days',
  ])('rejects an invalid or unsupported day window: %s', (query) => {
    expect(parseExplicitDayCount(query)).toBe('invalid')
    expect(
      parseJevNameSearchResponse(
        response({ expiry_window: choice('positive_days') }),
        `names expiring ${query}`,
      ),
    ).toBeNull()
  })

  it('rejects a low-confidence requested facet instead of applying the others', () => {
    expect(
      parseJevNameSearchResponse(
        response({ role: choice('manager'), favorite: choice('yes', 0.2) }),
        'favrites managed by me expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ role: choice('manager', 0.2) }),
        'nams im managr of expiring soon',
      ),
    ).toBeNull()
  })

  it.each([
    ['names past grace', { expiry: choice('in-grace') }],
    ['not favorites', { expiry: choice('any'), favorite: choice('yes') }],
    [
      'names except my primary',
      { expiry: choice('any'), primary: choice('yes') },
    ],
    [
      'v1 names eligible for upgrade',
      {
        expiry: choice('any'),
        version: choice('v2'),
        upgrade: choice('eligible'),
      },
    ],
    ['owner names', { expiry: choice('any'), role: choice('manager') }],
  ])('rejects model choices contradicting explicit wording: %s', (query, answers) => {
    expect(
      parseJevNameSearchResponse(
        response(answers as Record<string, unknown>),
        query as string,
      ),
    ).toBeNull()
  })

  it('rejects spurious extra constraints for unambiguous single-facet requests', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          favorite: choice('no'),
          primary: choice('no', 0.6),
        }),
        'not favorites',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ sort: choice('expiry-asc') }),
        'sort by expiry',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({
          sort: choice('expiry-asc'),
          search_shape: choice('sort_only'),
        }),
        'put closest expiry first',
      ),
    ).toBeNull()
  })

  it('validates request shape and expiry window choices before applying facets', () => {
    for (const search_shape of [
      choice('unsupported'),
      choice('none'),
      choice('alternatives'),
      choice('bounded_range'),
      choice('unknown_expiry'),
      choice('conjunction', 0.2),
      choice('invented'),
      { type: 'noul', noul: 1 },
    ]) {
      expect(
        parseJevNameSearchResponse(
          response({ search_shape }),
          'names expiring soon',
        ),
      ).toBeNull()
    }
    for (const expiry_window of [
      choice('unsupported'),
      choice('invented'),
      choice('positive_days', 0.2),
    ]) {
      expect(
        parseJevNameSearchResponse(
          response({ expiry_window }),
          'names expiring within 45 days',
        ),
      ).toBeNull()
    }
    expect(
      parseJevNameSearchResponse(
        response({ expiry_window: choice('none') }),
        'names expiring within 45 days',
      ),
    ).toBeNull()
  })

  it.each([
    'constructor',
    'toString',
    '__proto__',
  ])('rejects inherited property names as facet choices: %s', (value) => {
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice(value) }),
        'names expiring soon',
      ),
    ).toBeNull()
  })

  it.each([
    'names with unknown expiry',
    'names whose expiry is missing',
    'names I own or manage',
    'names about surfing expiring soon',
  ])('rejects unsupported meaning even when every model choice is confident: %s', (query) => {
    expect(
      parseJevNameSearchResponse(
        response({
          search_shape: choice('conjunction'),
          expiry_window: choice('soon'),
        }),
        query,
      ),
    ).toBeNull()
  })
})
