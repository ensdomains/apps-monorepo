import type { AiHandoffInputs } from '@/features/ai/prepareAiHandoff'
import type { AiEvalCase, EvalExpected } from './corpus'

// Authored independently before provider calls for the focused family pass.
// Every fourth row is reserved. Keep complete expectations unchanged after results.
type Row = readonly [
  query: string,
  expected: EvalExpected,
  language?: AiEvalCase['language'],
  inputs?: AiHandoffInputs,
]
const ready = (
  intent: string,
  details: Record<string, unknown>,
): EvalExpected => ({
  status: 'ready',
  action: { intent, ...details },
})
const missing = (field: string): EvalExpected => ({
  status: 'needs_input',
  field,
})
const unsupported: EvalExpected = { status: 'unsupported' }
const migration = (
  excludeManagerRestoration: boolean,
  names?: readonly string[],
) =>
  ready('migrate', { ...(names ? { names } : {}), excludeManagerRestoration })
const profile = (
  name: string,
  section: string,
  proposal: Record<string, unknown>,
) => ready('edit_profile', { name, section, proposal })
const customLink = (name: string, title: string, url: string) =>
  ready('edit_profile', { name, section: 'links', link: { name: title, url } })
const groups: readonly {
  key: string
  family: AiEvalCase['family']
  rows: readonly Row[]
}[] = [
  {
    key: 'migration',
    family: 'migrate',
    rows: [
      [
        'Upgrade eligible V1 names, excluding names that need their manager restored',
        migration(true),
      ],
      [
        'Move my eligible names to ENSv2 but leave out manager-restoration cases',
        migration(true),
        'paraphrase',
      ],
      [
        'migrte eligible old names without restoring managrs',
        migration(true),
        'typo',
      ],
      [
        'Please upgrade the eligible names except those requiring restoration of the manager',
        migration(true),
        'paraphrase',
      ],
      [
        'Upgrade juniper.eth and acacia.eth, skipping manager restoration',
        migration(true, ['juniper.eth', 'acacia.eth']),
      ],
      [
        'Start migration for juniper.eth and acacia.eth',
        migration(false, ['juniper.eth', 'acacia.eth']),
      ],
      [
        'Move eligible V1 names over and avoid ones needing manager restoration',
        migration(true),
        'paraphrase',
      ],
      [
        'Migrate acacia.eth without restoring its manager',
        migration(true, ['acacia.eth']),
      ],
      ['Upgrade eligible V1 names but only my favourites', unsupported],
      [
        'Do not migrate juniper.eth, even if no manager restoration is needed',
        unsupported,
      ],
      [
        'Upgrade juniper.eth but do not renew acacia.eth without manager restoration',
        unsupported,
      ],
      [
        'Upgrade eligible names only if the gas costs less than five dollars',
        unsupported,
      ],
      [
        'Begin the upgrade for every eligible V1 name',
        migration(false),
        'paraphrase',
      ],
      [
        'Upgrade juniper.eth, excluding anything needing manager restoration',
        migration(true, ['juniper.eth']),
      ],
      [
        'upgarde acacia.eth and juniper.eth, excludng manager restoration',
        migration(true, ['acacia.eth', 'juniper.eth']),
        'typo',
      ],
      [
        'Move eligible V1 names to V2; skip the ones whose managers need restoring',
        migration(true),
        'paraphrase',
      ],
    ],
  },
  {
    key: 'profile',
    family: 'edit_profile',
    rows: [
      [
        'Add https://github.com/juniper-studio as a link on juniper.eth',
        customLink(
          'juniper.eth',
          'GitHub',
          'https://github.com/juniper-studio',
        ),
      ],
      [
        'Set the GitHub contact on acacia.eth to acacia-dev',
        profile('acacia.eth', 'contact', {
          field: 'github',
          value: 'acacia-dev',
        }),
      ],
      ['Add a website link to juniper.eth please', missing('url')],
      [
        'For acacia.eth use the existing Ethereum address as its Polygon address',
        profile('acacia.eth', 'addresses', {
          field: 'address',
          coinType: 2147483785,
          operation: 'use_eth',
          value: '',
        }),
        'paraphrase',
      ],
      [
        'Replace the GitHub contact juniper-old with juniper-new on juniper.eth',
        profile('juniper.eth', 'contact', {
          field: 'github',
          value: 'juniper-new',
          expectedValue: 'juniper-old',
        }),
      ],
      [
        'Add my GitHub as a custom link on acacia.eth: https://github.com/acacia-dev',
        customLink('acacia.eth', 'GitHub', 'https://github.com/acacia-dev'),
      ],
      ['Rename the "Code" link on juniper.eth', missing('profileLinkName')],
      [
        'Use the Ethereum address already on juniper.eth for its Base address',
        profile('juniper.eth', 'addresses', {
          field: 'address',
          coinType: 2147568180,
          operation: 'use_eth',
          value: '',
        }),
      ],
      ['Add a GitHub contact to juniper.eth', missing('profileValue')],
      ['Add a website link at https://example.net/acacia', missing('name')],
      [
        'Set acacia.eth Bitcoin record to the address belonging to Satoshi',
        unsupported,
      ],
      [
        'Set juniper.eth GitHub to juniper-new unless it has more than fifty followers',
        unsupported,
      ],
      [
        'pin the githb contact on acacia.eth',
        profile('acacia.eth', 'contact', {
          field: 'github',
          operation: 'feature',
          value: '',
        }),
        'typo',
      ],
      [
        'Unpin the GitHub contact on juniper.eth',
        profile('juniper.eth', 'contact', {
          field: 'github',
          operation: 'unfeature',
          value: '',
        }),
      ],
      [
        "Don't replace juniper.eth GitHub juniper-old with juniper-new",
        unsupported,
      ],
      [
        'Change the "Studio" link title on acacia.eth to "Work"',
        profile('acacia.eth', 'links', {
          field: 'link',
          operation: 'rename',
          value: '',
          linkName: 'Work',
          linkTarget: 'Studio',
        }),
        'paraphrase',
      ],
    ],
  },
  {
    key: 'selection',
    family: 'find_names',
    rows: [
      [
        'Show my favourite V2 names that I manage and expire within 61 days',
        ready('find_names', {
          filters: {
            favorite: 'yes',
            version: 'v2',
            role: 'manager',
            expiry: 'expiring',
            withinDays: 61,
          },
        }),
      ],
      [
        'List juniper.eth and acacia.eth only when they are favourites',
        ready('find_names', {
          names: ['juniper.eth', 'acacia.eth'],
          filters: { favorite: 'yes' },
        }),
      ],
      [
        'Renew owned V1 names in grace for another 56 days',
        ready('bulk_renew', {
          filters: { role: 'owner', version: 'v1', expiry: 'in-grace' },
          durationDays: 56,
        }),
      ],
      [
        'Find unstarred V2 names that are not primary, sorted by latest expiry',
        ready('find_names', {
          filters: {
            favorite: 'no',
            version: 'v2',
            primary: 'no',
            sort: 'expiry-desc',
          },
        }),
      ],
      [
        'Give my managed names expiring within 22 days another three years',
        ready('bulk_renew', {
          filters: { role: 'manager', expiry: 'expiring', withinDays: 22 },
          durationYears: 3,
        }),
        'paraphrase',
      ],
      [
        'shwo unstarred v1 nmaes past grace',
        ready('find_names', {
          filters: { favorite: 'no', version: 'v1', expiry: 'past-grace' },
        }),
        'typo',
      ],
      [
        'Renew those names except favourites for 63 days',
        ready('bulk_renew', {
          filters: { version: 'v2', favorite: 'no' },
          durationDays: 63,
        }),
        'paraphrase',
        { lastFilters: { version: 'v2' } },
      ],
      [
        'Show never-expiring names that I own, excluding primary names',
        ready('find_names', {
          filters: { expiry: 'non-expiring', role: 'owner', primary: 'no' },
        }),
        'paraphrase',
      ],
      ['Renew juniper.eth and acacia.eth for 31', missing('durationUnit')],
      ['Show favourite names expiring after 22 days', unsupported],
      ['Find names I own or names I manage', unsupported],
      ['Renew V2 names for half a year', unsupported],
      ['Show favourite V1 names and transfer them to acacia.eth', unsupported],
      ['Do not renew names expiring within 61 days', unsupported],
      [
        'Show active V1 names I own, alphabetically',
        ready('find_names', {
          filters: {
            expiry: 'active',
            version: 'v1',
            role: 'owner',
            sort: 'name-asc',
          },
        }),
      ],
      [
        'Renew my favourite V2 names expiring within seventy-three days for 91 days',
        ready('bulk_renew', {
          filters: {
            favorite: 'yes',
            version: 'v2',
            expiry: 'expiring',
            withinDays: 73,
          },
          durationDays: 91,
        }),
        'paraphrase',
      ],
    ],
  },
]

export const FAMILY_AI_EVAL_CORPUS: readonly AiEvalCase[] = groups.flatMap(
  (group) =>
    group.rows.map(
      ([query, expected, language = 'canonical', inputs], index) => ({
        id: `family-${group.key}-${index + 1}`,
        entryPoint: 'ai' as const,
        category:
          expected.status === 'ready'
            ? ('supported' as const)
            : expected.status === 'needs_input'
              ? ('clarification' as const)
              : ('unsupported' as const),
        family:
          expected.status === 'ready' && expected.action.intent === 'bulk_renew'
            ? ('bulk_renew' as const)
            : group.family,
        language,
        split:
          (index + 1) % 4 === 0
            ? ('heldout' as const)
            : ('development' as const),
        smoke: index < 3,
        query,
        expected,
        ...(inputs ? { inputs } : {}),
      }),
    ),
)
