import { describe, expect, it } from 'vitest'
import {
  buildMigrationQuestions,
  isSingleMigrationIntent,
  parseMigrationIntent,
} from './migrationIntent'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (
  restoration: 'exclude' | 'none' = 'exclude',
  extra: Record<string, unknown> = {},
) => ({
  migration_constraints: choice('represented'),
  migration_restoration: choice(restoration),
  request_mode: choice('requested'),
  action_count: choice('one'),
  next_intent: choice('none'),
  multi_action: { type: 'noul', noul: 0.01 },
  ...extra,
})

const exclusions = [
  'Upgrade eligible V1 names, leaving out ones whose manager must be restored',
  'migrte eligble v1 names, skip managr restoration',
  'Move over my V1 names but skip manager restoration',
  'Upgrade eligible V1 names without restoring managers',
  'upgarde v1 names excludng manager restoration',
  'Can we upgrade eligible names and avoid the manager-restoration ones?',
  'Please migrate my ENSv1 names to ENSv2, except those requiring their manager restored',
  'Migrate eligible names and leave out anything that needs manager restoration',
  'Upgrade my names without names that have a manager to restore',
  'Upgrade my names, omit those which require restoration for their manager',
  'Move eligible V1 names over and avoid ones needing manager restoration',
] as const

describe('migration action and restoration selection', () => {
  it.each([
    'Upgrade all eligible V1 names',
    'Migrate all of my ENSv1 names to ENSv2',
    'Please upgrade every eligible name',
    'migrte all eligble v1 names',
  ])('preserves an explicit selection of all eligible names: %s', (query) => {
    expect(parseMigrationIntent(query, answers('none'))).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: false,
      allEligible: true,
    })
  })

  it.each([
    'Upgrade all selected names',
    'Upgrade all those names',
    'Upgrade all these names',
    'Upgrade all eligible names with blue avatars',
  ])('does not broaden a constrained all-selection into the wallet: %s', (query) => {
    expect(parseMigrationIntent(query, answers('none'))).toBeNull()
  })

  it('preserves exact targets and restoration exclusions instead of adding wallet scope', () => {
    expect(
      parseMigrationIntent(
        'Upgrade all eligible V1 names without manager restoration',
        answers(),
      ),
    ).toEqual({ intent: 'migrate', excludeManagerRestoration: true })
    expect(
      parseMigrationIntent('Upgrade all.eth', answers('none'), ['all.eth']),
    ).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: false,
      names: ['all.eth'],
    })
  })

  it('understands a plural manager typo with confident semantic coverage', () => {
    expect(
      parseMigrationIntent(
        'migrte eligible old names without restoring managrs',
        answers(),
      ),
    ).toEqual({ intent: 'migrate', excludeManagerRestoration: true })
  })

  it('preserves a list of exact targets before a skipping clause', () => {
    const query =
      'Upgrade juniper.eth and acacia.eth, skipping manager restoration'
    const names = ['juniper.eth', 'acacia.eth']
    expect(parseMigrationIntent(query, answers(), names)).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: true,
      names,
    })
    expect(isSingleMigrationIntent(query, answers(), names)).toBe(true)
  })

  it('never combines alternative exact targets into a combined migration', () => {
    const query = 'Upgrade cedar.eth or birch.eth'
    expect(
      parseMigrationIntent(query, answers('none'), ['cedar.eth', 'birch.eth']),
    ).toBeNull()
  })

  it.each([
    'Upgrade names except ones whose manager doesn’t need restoration',
    "Upgrade names skip names that won't require manager restoration",
    'Upgrade names skip names that won’t require manager restoration',
  ])('rejects negated restoration requirements despite optimistic semantic choices: %s', (query) => {
    expect(parseMigrationIntent(query, answers())).toBeNull()
    expect(isSingleMigrationIntent(query, answers())).toBe(false)
  })

  it.each(
    exclusions,
  )('binds the exclusion clause to restoration: %s', (query) => {
    expect(parseMigrationIntent(query, answers())).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: true,
    })
    expect(isSingleMigrationIntent(query, answers())).toBe(true)
  })

  it.each([
    'Can you start upgrading my eligible names?',
    'I would like to migrate my eligible ENS names',
    'Migrate from ENSv1 to ENSv2',
    'Take my eligible ENSv1 names through the upgrade',
    'Move my ENSv1 names to ENSv2',
  ])('preserves normal semantic requests without requiring the strict metadata proof: %s', (query) => {
    expect(parseMigrationIntent(query, answers('none'))).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: false,
    })
    expect(parseMigrationIntent(query, {})).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: false,
    })
  })

  it('does not use unknown modifiers to bypass weak generic metadata', () => {
    const query =
      'Could you start upgrading names, except those that will require their manager to be restored'
    expect(parseMigrationIntent(query, answers())).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: true,
    })
    expect(
      isSingleMigrationIntent(
        query,
        answers('exclude', { multi_action: { type: 'noul', noul: 0.4 } }),
      ),
    ).toBe(false)
  })

  it('does not use an irrelevant absent-restoration certainty as a veto', () => {
    expect(
      parseMigrationIntent(
        'I would like to migrate my eligible names',
        answers('none', { migration_restoration: choice('none', 0.3) }),
      ),
    ).toMatchObject({ excludeManagerRestoration: false })
    expect(
      parseMigrationIntent(
        'Migrate names without manager restoration',
        answers('exclude', { migration_restoration: choice('none', 0.3) }),
      ),
    ).toBeNull()
    expect(
      parseMigrationIntent(
        'Migrate names',
        answers('none', { migration_restoration: choice('exclude', 0.3) }),
      ),
    ).toBeNull()
    expect(
      parseMigrationIntent(
        'Migrate names',
        answers('none', { migration_restoration: choice('none', Number.NaN) }),
      ),
    ).toBeNull()
  })

  it.each([
    'constructor',
    '__proto__',
    'toString',
  ])('keeps inherited object keys as ordinary unproved words: %s', (word) => {
    expect(() =>
      isSingleMigrationIntent(`Migrate ${word} names`, answers('none')),
    ).not.toThrow()
    expect(
      isSingleMigrationIntent(`Migrate ${word} names`, answers('none')),
    ).toBe(false)
  })

  it('cannot drop an exact name when the local extraction was not provided', () => {
    expect(
      parseMigrationIntent('Upgrade cedar.eth', answers('none')),
    ).toBeNull()
  })

  it.each([
    'Upgrade cedar.eth instead of birch.eth',
    'Upgrade cedar.eth rather than birch.eth',
  ])('does not add an explicitly excluded target despite optimistic facets: %s', (query) => {
    const names = ['cedar.eth', 'birch.eth']
    for (const response of [answers('none'), {}]) {
      expect(parseMigrationIntent(query, response, names)).toBeNull()
      expect(isSingleMigrationIntent(query, response, names)).toBe(false)
    }
  })

  it('supports captured legacy answers only when local clauses are fully represented', () => {
    for (const query of exclusions) {
      expect(
        parseMigrationIntent(query, {
          migration_constraints: choice('represented'),
        }),
      ).toEqual({ intent: 'migrate', excludeManagerRestoration: true })
    }
  })

  it.each([
    'Upgrade my eligible V1 names',
    'Migrate my names to ENSv2',
    'Move over my V1 names',
    'Please migrate',
  ])('does not invent an exclusion: %s', (query) => {
    expect(parseMigrationIntent(query, answers('none'))).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: false,
    })
    expect(parseMigrationIntent(query, answers('exclude'))).toBeNull()
  })

  it('keeps exact names untouched, including words that look like instructions', () => {
    const names = ['skip.eth', 'manager.eth', 'café.eth']
    expect(
      parseMigrationIntent(
        'Upgrade skip.eth, manager.eth and café.eth without restoring managers',
        answers(),
        names,
      ),
    ).toEqual({
      intent: 'migrate',
      excludeManagerRestoration: true,
      names,
    })
    expect(
      parseMigrationIntent(
        'Upgrade manager.eth and skip.eth to v2',
        answers('none'),
        names.slice(0, 2),
      ),
    ).toMatchObject({ excludeManagerRestoration: false })
  })

  it.each([
    'Upgrade only names needing manager restoration',
    'Upgrade names except those that do not need manager restoration',
    'Upgrade names without manager restoration, but include restoration names',
    'Do not upgrade names, skip manager restoration',
    "Don't migrate my V1 names without restoring managers",
    'Never migrate names except those needing manager restoration',
    'Upgrade names but do not exclude manager restoration',
    'Upgrade names and restore managers',
    'Upgrade names without those that require no manager restoration',
    'Upgrade names without those unable to restore their manager',
    'Upgrade names without manager restoration and restore managers',
    'Restore managers without upgrading the names',
  ])('rejects opposite direction or a separate restoration action even with optimistic answers: %s', (query) => {
    expect(parseMigrationIntent(query, answers())).toBeNull()
    expect(isSingleMigrationIntent(query, answers())).toBe(false)
  })

  it.each([
    'Upgrade names except cedar.eth',
    'Upgrade names without manager restoration except cedar.eth',
    'Upgrade cedar.eth and birch.eth except birch.eth',
    'Upgrade names except favourites needing manager restoration',
    'Upgrade names without restoring managers and favourites',
    'Upgrade only favourite V1 names without restoring managers',
    'Upgrade expired names without restoring managers',
    'Upgrade names I own without restoring managers',
    'Upgrade names under 10 dollars without restoring managers',
    'Upgrade names tomorrow without restoring managers',
    'Upgrade eligible V2 names without restoring managers',
    'Upgrade names without restoring managers then set cedar.eth as primary',
    'Upgrade names and renew cedar.eth without restoring managers',
    'Upgrade names avoiding fees without restoring managers',
    'Upgrade names without restoring managers if it is free',
  ])('accounts for extra names, filters, conditions and actions instead of dropping them: %s', (query) => {
    expect(
      parseMigrationIntent(query, answers(), ['cedar.eth', 'birch.eth']),
    ).toBeNull()
  })

  it.each([
    'none',
    'only',
    'unclear',
  ])('rejects a contradictory restoration facet %s', (facet) => {
    expect(
      parseMigrationIntent(
        exclusions[0],
        answers('exclude', { migration_restoration: choice(facet) }),
      ),
    ).toBeNull()
  })

  it.each([
    0.64,
    -1,
    1.1,
    Number.NaN,
  ])('rejects weak or malformed semantic evidence %s', (confidence) => {
    expect(
      parseMigrationIntent(
        exclusions[0],
        answers('exclude', {
          migration_restoration: choice('exclude', confidence),
        }),
      ),
    ).toBeNull()
    expect(
      parseMigrationIntent(
        exclusions[0],
        answers('exclude', {
          migration_constraints: choice('represented', confidence),
        }),
      ),
    ).toBeNull()
  })

  it('keeps unknown wording unproved rather than treating a word whitelist as complete coverage', () => {
    expect(
      parseMigrationIntent(
        'Upgrade selected names with custom qualifiers without restoring managers',
        answers(),
      ),
    ).toBeNull()
    expect(
      parseMigrationIntent(
        'Upgrade names except managers lacking resolver permissions',
        answers(),
      ),
    ).toBeNull()
  })
})

describe('migration metadata agreement', () => {
  it('lets a complete positive operation plus subset clause settle weak generic metadata', () => {
    const evidence = answers('exclude', {
      request_mode: choice('requested', 0.35),
      action_count: choice('two', 0.43),
      multi_action: { type: 'noul', noul: 0.47 },
    })
    expect(isSingleMigrationIntent(exclusions[5], evidence)).toBe(true)
  })

  it.each([
    { request_mode: choice('negated', 0.3) },
    { request_mode: choice('unclear', 0.3) },
    { action_count: choice('many', 0.2) },
    { action_count: choice('two', 0.65) },
    { next_intent: choice('set_primary', 0.8) },
    { multi_action: { type: 'noul', noul: 0.7 } },
    { multi_action: { type: 'noul', noul: -1 } },
    { multi_action: { type: 'noul', noul: Number.NaN } },
    {
      request_mode: {
        type: 'choice',
        choice: 'requested',
        confidence: Infinity,
      },
    },
  ])('preserves explicit prohibitions, additional actions, and malformed data: %j', (extra) => {
    expect(
      isSingleMigrationIntent(exclusions[0], answers('exclude', extra)),
    ).toBe(false)
  })

  it('uses one closed-choice selection facet with no query or private values in the question', () => {
    expect(Object.keys(buildMigrationQuestions())).toEqual([
      'migration_restoration',
    ])
    expect(
      Object.keys(buildMigrationQuestions().migration_restoration.criteria),
    ).toEqual(['none', 'exclude', 'only', 'unclear'])
    expect(JSON.stringify(buildMigrationQuestions())).not.toContain('cedar.eth')
  })
})
