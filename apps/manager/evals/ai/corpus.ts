import type { AiIntent } from '@/features/ai/intent'
import type { AiHandoffInputs } from '@/features/ai/prepareAiHandoff'

// Expected outcomes are authored from user intent, independently of Jev output.
// Keep failed expectations: never relabel a rejected supported request as correct.
export type EvalExpected =
  | {
      readonly status: 'ready'
      readonly action: Record<string, unknown>
      readonly nextIntent?: AiIntent
    }
  | {
      readonly status: 'needs_input'
      readonly field: string
      // New corpora can require the whole understood remainder to survive a
      // clarification. Existing labels deliberately retain their prior shape.
      readonly interpretedAction?: Record<string, unknown>
      readonly nextIntent?: AiIntent
    }
  | { readonly status: 'unsupported' }

export type AiEvalCase = {
  readonly id: string
  readonly entryPoint: 'ai' | 'dashboard'
  readonly category: 'supported' | 'clarification' | 'unsupported'
  readonly language: 'canonical' | 'paraphrase' | 'typo'
  readonly split: 'development' | 'heldout'
  readonly family: AiIntent | 'dashboard' | 'safety'
  readonly query: string
  readonly expected: EvalExpected
  readonly inputs?: AiHandoffInputs
  readonly smoke: boolean
}

type SupportedRow = readonly [
  query: string,
  action: Record<string, unknown>,
  language?: AiEvalCase['language'],
  inputs?: AiHandoffInputs,
  nextIntent?: AiIntent,
]
const name = 'pookie.eth'
const ready = (intent: AiIntent, details: Record<string, unknown> = {}) => ({
  intent,
  ...details,
})
const profile = (
  section: string,
  field: string,
  value: string,
  expectedValue?: string,
) =>
  ready('edit_profile', {
    name,
    section,
    proposal: {
      field,
      value,
      ...(expectedValue === undefined ? {} : { expectedValue }),
    },
  })
// This frozen corpus covers the original ten families, independently of later additions.
const groups: Readonly<Record<string, readonly SupportedRow[]>> = {
  set_primary: [
    ['Set pookie.eth as my primary name', ready('set_primary', { name })],
    [
      'Make pookie.eth my main ENS name',
      ready('set_primary', { name }),
      'paraphrase',
    ],
    [
      'pookie.eth should be my primary please',
      ready('set_primary', { name }),
      'paraphrase',
    ],
    [
      'Switch my primary to alice.eth',
      ready('set_primary', { name: 'alice.eth' }),
      'paraphrase',
    ],
    ['plz set pookie.eth as primry', ready('set_primary', { name }), 'typo'],
    [
      'Use pookie.eth as my reverse name',
      ready('set_primary', { name }),
      'paraphrase',
    ],
    ['Set POOKIE.eth as primary.', ready('set_primary', { name })],
    [
      'could u make pookie.eth the name for my wallet?',
      ready('set_primary', { name }),
      'paraphrase',
    ],
  ],
  register: [
    [
      'Register pookie.eth for 69 days',
      ready('register', { name, durationDays: 69 }),
    ],
    [
      'I want to register alice.eth for one year',
      ready('register', { name: 'alice.eth', durationDays: 365 }),
      'paraphrase',
    ],
    [
      'Register pookie.eth for 28 days',
      ready('register', { name, durationDays: 28 }),
    ],
    [
      'Can I get pookie.eth for six weeks?',
      ready('register', { name, durationDays: 42 }),
      'paraphrase',
    ],
    [
      'regstr pookie.eth for 30 days pls',
      ready('register', { name, durationDays: 30 }),
      'typo',
    ],
    [
      'pookie.eth, register it for two years',
      ready('register', { name, durationDays: 730 }),
      'paraphrase',
    ],
    [
      'Register pookie.eth for 69 days and then set it as primary',
      ready('register', { name, durationDays: 69 }),
      'canonical',
      undefined,
      'set_primary',
    ],
    [
      'Please register freshname.eth for 90 days',
      ready('register', { name: 'freshname.eth', durationDays: 90 }),
      'paraphrase',
    ],
  ],
  renew: [
    [
      'Extend pookie.eth for another 10 days',
      ready('renew', { name, durationDays: 10 }),
    ],
    [
      'can u renew pookie.eth for another 10 days pls',
      ready('renew', { name, durationDays: 10 }),
      'paraphrase',
    ],
    [
      'I wanna keep pookie.eth for 10 more days',
      ready('renew', { name, durationDays: 10 }),
      'paraphrase',
    ],
    [
      'plz extnd pookie.eth fr anothr 10 days',
      ready('renew', { name, durationDays: 10 }),
      'typo',
    ],
    [
      'Renew alice.eth for two years',
      ready('renew', { name: 'alice.eth', durationYears: 2 }),
    ],
    [
      'Add two weeks to pookie.eth',
      ready('renew', { name, durationDays: 14 }),
      'paraphrase',
    ],
    ['renew pookie.eth for 1 day', ready('renew', { name, durationDays: 1 })],
    [
      'Can you extend pookie.eth by 30 days?',
      ready('renew', { name, durationDays: 30 }),
      'paraphrase',
    ],
  ],
  find_names: [
    [
      'Show my manager names expiring within 45 days',
      ready('find_names', {
        filters: { role: 'manager', expiry: 'expiring', withinDays: 45 },
      }),
    ],
    [
      'List all grace period names',
      ready('find_names', { filters: { expiry: 'in-grace' } }),
    ],
    [
      'Which names do I own?',
      ready('find_names', { filters: { role: 'owner' } }),
      'paraphrase',
    ],
    [
      'Show my V1 favorites, soonest expiry first',
      ready('find_names', {
        filters: { version: 'v1', favorite: 'yes', sort: 'expiry-asc' },
      }),
    ],
    [
      'show my namse expiring soon',
      ready('find_names', { filters: { expiry: 'expiring' } }),
      'typo',
    ],
    [
      'Find names that never expire',
      ready('find_names', { filters: { expiry: 'non-expiring' } }),
      'paraphrase',
    ],
    [
      'Show eligible V1 names except favorites',
      ready('find_names', {
        filters: { version: 'v1', upgrade: 'eligible', favorite: 'no' },
      }),
    ],
    [
      'List my names past grace, oldest first',
      ready('find_names', {
        filters: { expiry: 'past-grace', sort: 'created-asc' },
      }),
      'paraphrase',
    ],
  ],
  bulk_renew: [
    [
      'Renew names expiring within 45 days',
      ready('bulk_renew', { filters: { expiry: 'expiring', withinDays: 45 } }),
    ],
    [
      'Renew those names',
      ready('bulk_renew', { filters: { expiry: 'expiring', withinDays: 45 } }),
      'canonical',
      { lastFilters: { expiry: 'expiring', withinDays: 45 } },
    ],
    [
      'Renew my favorite names',
      ready('bulk_renew', { filters: { favorite: 'yes' } }),
    ],
    [
      'Extend all my V2 names expiring soon',
      ready('bulk_renew', { filters: { version: 'v2', expiry: 'expiring' } }),
      'paraphrase',
    ],
    [
      'plz renew my favrite names',
      ready('bulk_renew', { filters: { favorite: 'yes' } }),
      'typo',
    ],
    [
      'Renew those names except favorites',
      ready('bulk_renew', {
        filters: { expiry: 'expiring', withinDays: 45, favorite: 'no' },
      }),
      'canonical',
      { lastFilters: { expiry: 'expiring', withinDays: 45 } },
    ],
    [
      'Renew my owned names in grace',
      ready('bulk_renew', { filters: { role: 'owner', expiry: 'in-grace' } }),
    ],
    [
      'Please renew names I manage that expire within 7 days',
      ready('bulk_renew', {
        filters: { role: 'manager', expiry: 'expiring', withinDays: 7 },
      }),
      'paraphrase',
    ],
  ],
  migrate: [
    [
      'Upgrade eligible V1 names except ones needing manager restoration',
      ready('migrate', { excludeManagerRestoration: true }),
    ],
    [
      'Upgrade my eligible V1 names',
      ready('migrate', { excludeManagerRestoration: false }),
    ],
    [
      'Move my ENSv1 names to ENSv2',
      ready('migrate', { excludeManagerRestoration: false }),
      'paraphrase',
    ],
    [
      'Migrate eligible names without manager restoration',
      ready('migrate', { excludeManagerRestoration: true }),
      'paraphrase',
    ],
    [
      'upgrde my v1 names pls',
      ready('migrate', { excludeManagerRestoration: false }),
      'typo',
    ],
    [
      'I want to migrate my eligible old ENS names',
      ready('migrate', { excludeManagerRestoration: false }),
      'paraphrase',
    ],
    [
      'Upgrade my names excluding those requiring manager restoration',
      ready('migrate', { excludeManagerRestoration: true }),
    ],
    [
      'Take my eligible ENSv1 names through the upgrade',
      ready('migrate', { excludeManagerRestoration: false }),
      'paraphrase',
    ],
  ],
  edit_profile: [
    [
      'Edit my profile pookie.eth and set github name to yoginth instead of bigint',
      profile('contact', 'github', 'yoginth', 'bigint'),
    ],
    [
      'Set the description of pookie.eth to "Building cool things"',
      profile('general', 'description', 'Building cool things'),
    ],
    [
      'Set pookie.eth avatar to https://example.com/avatar.png',
      profile('general', 'avatar', 'https://example.com/avatar.png'),
    ],
    [
      'Set pookie.eth email to hello@example.com',
      profile('contact', 'email', 'hello@example.com'),
    ],
    [
      'set pookie.eth githb to yoginth',
      profile('contact', 'github', 'yoginth'),
      'typo',
    ],
    [
      'Set pookie.eth Ethereum address to 0x000000000000000000000000000000000000dEaD',
      profile(
        'addresses',
        'eth_address',
        '0x000000000000000000000000000000000000dEaD',
      ),
    ],
    [
      'Change the theme of pookie.eth to Garnet',
      profile('appearance', 'theme', '#E72A96'),
      'paraphrase',
    ],
    [
      'Add https://example.com/work to the links of pookie.eth',
      ready('edit_profile', {
        name,
        section: 'links',
        link: { name: 'Link', url: 'https://example.com/work' },
      }),
      'paraphrase',
    ],
  ],
  notification: [
    [
      'Turn on favourite expiry reminders',
      ready('notification', {
        preference: 'favouritedNameExpiry',
        enabled: true,
      }),
    ],
    [
      'mute favourite expiry reminders',
      ready('notification', {
        preference: 'favouritedNameExpiry',
        enabled: false,
      }),
      'paraphrase',
    ],
    [
      'Turn off owned name expiry notifications',
      ready('notification', { preference: 'ownedNameExpiry', enabled: false }),
    ],
    [
      'Let me know when my owned names expire',
      ready('notification', { preference: 'ownedNameExpiry', enabled: true }),
      'paraphrase',
    ],
    [
      'turn on favrite expiry remnders',
      ready('notification', {
        preference: 'favouritedNameExpiry',
        enabled: true,
      }),
      'typo',
    ],
    [
      'Subscribe me to ENS Labs updates',
      ready('notification', { preference: 'ensLabsUpdates', enabled: true }),
      'paraphrase',
    ],
    [
      'Stop sending ENS Labs news',
      ready('notification', { preference: 'ensLabsUpdates', enabled: false }),
      'paraphrase',
    ],
    [
      'Disable expiry alerts for my favorite names',
      ready('notification', {
        preference: 'favouritedNameExpiry',
        enabled: false,
      }),
      'paraphrase',
    ],
  ],
  favorite: [
    ['Favourite pookie.eth', ready('favorite', { name })],
    [
      'Favorite alice.eth please',
      ready('favorite', { name: 'alice.eth' }),
      'paraphrase',
    ],
    [
      'Add pookie.eth to my favorites',
      ready('favorite', { name }),
      'paraphrase',
    ],
    ['Star pookie.eth for me', ready('favorite', { name }), 'paraphrase'],
    ['favrite pookie.eth plz', ready('favorite', { name }), 'typo'],
    ['Bookmark pookie.eth', ready('favorite', { name }), 'paraphrase'],
    ['Make pookie.eth a favourite', ready('favorite', { name }), 'paraphrase'],
    [
      'Can you save alice.eth in my favorite names?',
      ready('favorite', { name: 'alice.eth' }),
      'paraphrase',
    ],
  ],
  view_name: [
    ['Show pookie.eth', ready('view_name', { name })],
    [
      'Open the profile for alice.eth',
      ready('view_name', { name: 'alice.eth' }),
      'paraphrase',
    ],
    ['Let me see pookie.eth', ready('view_name', { name }), 'paraphrase'],
    ['Take me to pookie.eth', ready('view_name', { name }), 'paraphrase'],
    ['shwo pookie.eth pls', ready('view_name', { name }), 'typo'],
    ['View POOKIE.eth.', ready('view_name', { name })],
    [
      'Could you bring up pookie.eth?',
      ready('view_name', { name }),
      'paraphrase',
    ],
    ['Open 😎.eth', ready('view_name', { name: '😎.eth' })],
  ],
}

const supported: readonly AiEvalCase[] = Object.entries(groups).flatMap(
  ([family, rows], groupIndex) =>
    rows.map(
      ([query, action, language = 'canonical', inputs, nextIntent], index) => ({
        id: `${family}-${index + 1}`,
        entryPoint: 'ai' as const,
        category: 'supported' as const,
        language,
        split:
          (groupIndex * 8 + index + 1) % 5 === 0
            ? ('heldout' as const)
            : ('development' as const),
        family: family as AiIntent,
        query,
        expected: {
          status: 'ready' as const,
          action,
          ...(nextIntent ? { nextIntent } : {}),
        },
        ...(inputs ? { inputs } : {}),
        smoke:
          index === 0 ||
          (family === 'renew' && [2, 3].includes(index)) ||
          (family === 'edit_profile' && index === 4) ||
          (family === 'notification' && index === 1),
      }),
    ),
)

const clarificationRows: readonly (readonly [string, string, AiIntent])[] = [
  ['Set my primary name', 'name', 'set_primary'],
  ['Register a name for 69 days', 'name', 'register'],
  ['Renew pookie.eth', 'durationYears', 'renew'],
  ['Register pookie.eth', 'durationDays', 'register'],
  ['Favourite a name', 'name', 'favorite'],
  ['Open a name profile', 'name', 'view_name'],
  ['Set pookie.eth GitHub username', 'profileValue', 'edit_profile'],
  ['Change pookie.eth email', 'profileValue', 'edit_profile'],
  ['Set the avatar for pookie.eth', 'profileValue', 'edit_profile'],
  ['Edit pookie.eth description', 'profileValue', 'edit_profile'],
  ['Set pookie.eth Ethereum address', 'profileValue', 'edit_profile'],
  ['Change pookie.eth theme', 'profileValue', 'edit_profile'],
  ['Add a link to pookie.eth', 'url', 'edit_profile'],
  ['Set alice.eth or bob.eth as primary', 'name', 'set_primary'],
  ['Renew alice.eth or bob.eth for two years', 'name', 'renew'],
  ['Set my GitHub to yoginth', 'name', 'edit_profile'],
  ['Turn on notifications', 'notificationPreference', 'notification'],
  ['Change favourite expiry reminders', 'notificationEnabled', 'notification'],
  ['Renew pookie.eth for 10', 'durationUnit', 'renew'],
  ['Change my profile', 'name', 'edit_profile'],
]
const clarification: readonly AiEvalCase[] = clarificationRows.map(
  ([query, field, family], index) => ({
    id: `clarification-${index + 1}`,
    entryPoint: 'ai',
    category: 'clarification',
    language: 'canonical',
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family,
    query,
    expected: { status: 'needs_input', field },
    smoke: [2, 13, 16].includes(index),
  }),
)
const unsupportedRows = [
  "don't renew pookie.eth",
  'Transfer pookie.eth to alice.eth',
  'Delete pookie.eth',
  'Sell pookie.eth for 2 ETH',
  'Register pookie.eth for 27 days',
  'Renew pookie.eth for two months',
  'Register pookie.eth tomorrow',
  'Remind me every 3 days before pookie.eth expires',
  "Set bitcoin address to satoshi's address",
  'Generate a funny description for pookie.eth',
  'Show names about surfing expiring soon',
  'Find names containing cat',
  'Renew pookie.eth and transfer it to alice.eth',
  'Register pookie.eth for 30 days and then set it as primary and then favorite it',
  'Renew pookie.eth for -10 days',
  'Renew pookie.eth for 1.5 days',
  'Renew pookie.eth for 10 days and 2 years',
  'Set pookie.eth GitHub to yoginth and email to hello@example.com',
  'Never set pookie.eth as my primary',
  'Turn favourite reminders both on and off',
]
const unsupported: readonly AiEvalCase[] = unsupportedRows.map(
  (query, index) => ({
    id: `unsupported-${index + 1}`,
    entryPoint: 'ai',
    category: 'unsupported',
    language: 'canonical',
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family: 'safety',
    query,
    expected: { status: 'unsupported' },
    smoke: [0, 8, 12].includes(index),
  }),
)
const dashboardRows: readonly (readonly [
  string,
  Record<string, unknown> | null,
  AiEvalCase['language']?,
])[] = [
  ['names expiring within 45 days', { expiry: 'expiring', withinDays: 45 }],
  [
    'my manager V1 names expiring within 7 days, soonest expiry first',
    {
      role: 'manager',
      version: 'v1',
      expiry: 'expiring',
      withinDays: 7,
      sort: 'expiry-asc',
    },
  ],
  ['names in grace', { expiry: 'in-grace' }],
  ['names past grace', { expiry: 'past-grace' }],
  ['non-expiring names', { expiry: 'non-expiring' }],
  ['names I own', { role: 'owner' }, 'paraphrase'],
  ['favorites except my primary name', { favorite: 'yes', primary: 'no' }],
  ['ENSv2 names, newest first', { version: 'v2', sort: 'created-desc' }],
  ['V1 names eligible for upgrade', { version: 'v1', upgrade: 'eligible' }],
  [
    'active names, reverse alphabetical order',
    { expiry: 'active', sort: 'name-desc' },
  ],
  ['expiring soon', { expiry: 'expiring' }],
  ['show my favrites', { favorite: 'yes' }, 'typo'],
  ['my primary name', { primary: 'yes' }],
  ['names not eligible for upgrade', { upgrade: 'ineligible' }],
  [
    'names I manage that expire in the next 120 days',
    { role: 'manager', expiry: 'expiring', withinDays: 120 },
    'paraphrase',
  ],
  ['names about surfing expiring soon', null],
  ['names I own or manage', null],
  ['names expiring between 10 and 20 days', null],
  ['names containing cat', null],
  ['V2 names eligible for upgrade', null],
]
const dashboard: readonly AiEvalCase[] = dashboardRows.map(
  ([query, filters, language = 'canonical'], index) => ({
    id: `dashboard-${index + 1}`,
    entryPoint: 'dashboard',
    category: filters ? 'supported' : 'unsupported',
    language,
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family: 'dashboard',
    query,
    expected: filters
      ? { status: 'ready', action: { filters } }
      : { status: 'unsupported' },
    smoke: false,
  }),
)

export const AI_EVAL_CORPUS: readonly AiEvalCase[] = [
  ...supported,
  ...clarification,
  ...unsupported,
  ...dashboard,
]
