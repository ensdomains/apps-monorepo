import type { AiHandoffInputs } from '@/features/ai/prepareAiHandoff'
import type { AiEvalCase, EvalExpected } from './corpus'

// Independent expectations authored before any responses in this pass.
// Every fourth row is reserved; do not change labels to match model outcomes.
type Row = readonly [
  query: string,
  expected: EvalExpected,
  language?: AiEvalCase['language'],
  inputs?: AiHandoffInputs,
]

const ready = (
  intent: string,
  details: Record<string, unknown>,
): EvalExpected => ({ status: 'ready', action: { intent, ...details } })
const missing = (field: string): EvalExpected => ({
  status: 'needs_input',
  field,
})
const unsupported: EvalExpected = { status: 'unsupported' }
const collection = (
  intent: 'bulk_renew' | 'find_names',
  filters: Record<string, unknown>,
  details: Record<string, unknown> = {},
) => ready(intent, { filters, ...details })
const profile = (
  name: string,
  section: string,
  proposal: Record<string, unknown>,
) => ready('edit_profile', { name, section, proposal })
const reuseEth = (name: string, coinType: number) =>
  profile(name, 'addresses', {
    field: 'address',
    coinType,
    operation: 'use_eth',
    value: '',
  })

const groups: readonly {
  key: string
  family: AiEvalCase['family']
  rows: readonly Row[]
}[] = [
  {
    key: 'time',
    family: 'bulk_renew',
    rows: [
      [
        'Renew managed V2 names expiring within 18 days for 74 days',
        collection(
          'bulk_renew',
          {
            role: 'manager',
            version: 'v2',
            expiry: 'expiring',
            withinDays: 18,
          },
          { durationDays: 74 },
        ),
      ],
      [
        'Add five years to favourite names expiring within 26 days',
        collection(
          'bulk_renew',
          { favorite: 'yes', expiry: 'expiring', withinDays: 26 },
          { durationYears: 5 },
        ),
        'paraphrase',
      ],
      [
        'Show non-primary names, earliest expiry first',
        collection('find_names', { primary: 'no', sort: 'expiry-asc' }),
      ],
      [
        'Extnd the v2 names I own by seven weeks',
        collection(
          'bulk_renew',
          { version: 'v2', role: 'owner' },
          { durationDays: 49 },
        ),
        'typo',
      ],
      [
        'renwe managed V2 names expriing within 18 days for 74 days',
        collection(
          'bulk_renew',
          {
            role: 'manager',
            version: 'v2',
            expiry: 'expiring',
            withinDays: 18,
          },
          { durationDays: 74 },
        ),
        'typo',
      ],
      ['Renew larch.eth and tamarind.eth for 44', missing('durationUnit')],
      [
        'Extend larch.eth and tamarind.eth by 44',
        collection(
          'bulk_renew',
          {},
          { names: ['larch.eth', 'tamarind.eth'], durationDays: 308 },
        ),
        'paraphrase',
        { durationUnit: 'weeks' },
      ],
      [
        'Renew the selected names for 52',
        missing('durationUnit'),
        'canonical',
        { lastNames: ['larch.eth', 'tamarind.eth'] },
      ],
      [
        'Find V2 names with expiry within twenty-nine days',
        collection('find_names', {
          version: 'v2',
          expiry: 'expiring',
          withinDays: 29,
        }),
        'paraphrase',
      ],
      [
        'Renew those matching names for 38 days',
        collection(
          'bulk_renew',
          { version: 'v2', primary: 'no' },
          { names: ['tamarind.eth', 'larch.eth'], durationDays: 38 },
        ),
        'paraphrase',
        {
          lastFilters: { version: 'v2', primary: 'no' },
          lastNames: ['tamarind.eth', 'larch.eth'],
        },
      ],
      [
        'Show favourite names sorted by latest expiry',
        collection('find_names', { favorite: 'yes', sort: 'expiry-desc' }),
      ],
      [
        'Do not renew the V2 names expiring within 18 days for 74 days',
        unsupported,
      ],
      ['Renew managed names for 28 days and two years', unsupported],
      ['Show names expiring after 65 days', unsupported],
      ['Add minus 17 days to owned names', unsupported],
      [
        'Give names expiring within nine days another four years',
        collection(
          'bulk_renew',
          { expiry: 'expiring', withinDays: 9 },
          { durationYears: 4 },
        ),
        'paraphrase',
      ],
      ['Renew the managed names for zero days', unsupported],
      ['Extend owned names for 19', missing('durationUnit')],
      [
        'Renew the favourite names for 74 days only if the total is below one dollar',
        unsupported,
      ],
      [
        'renew v2 nmaes expriing within thiry days for 47 days',
        collection(
          'bulk_renew',
          { version: 'v2', expiry: 'expiring', withinDays: 30 },
          { durationDays: 47 },
        ),
        'typo',
      ],
    ],
  },
  {
    key: 'date',
    family: 'bulk_renew',
    rows: [
      [
        'Renew my V2 names until 2031-04-23',
        collection(
          'bulk_renew',
          { version: 'v2' },
          { targetDate: '2031-04-23' },
        ),
      ],
      [
        'Extend favourite names to 7 November 2030',
        collection(
          'bulk_renew',
          { favorite: 'yes' },
          { targetDate: '2030-11-07' },
        ),
        'paraphrase',
      ],
      [
        'Renew larch.eth and tamarind.eth to the same expiry of 2032-02-29',
        collection(
          'bulk_renew',
          {},
          {
            names: ['larch.eth', 'tamarind.eth'],
            targetDate: '2032-02-29',
          },
        ),
      ],
      [
        'Bring every owned V2 name to an expiry of 14 June 2033',
        collection(
          'bulk_renew',
          { role: 'owner', version: 'v2' },
          {
            targetDate: '2033-06-14',
          },
        ),
        'paraphrase',
      ],
      [
        'renwe my V2 nmaes until 2031-04-23',
        collection(
          'bulk_renew',
          { version: 'v2' },
          { targetDate: '2031-04-23' },
        ),
        'typo',
      ],
      [
        'Renew managed names expiring within 24 days until 2031-09-08',
        collection(
          'bulk_renew',
          {
            role: 'manager',
            expiry: 'expiring',
            withinDays: 24,
          },
          { targetDate: '2031-09-08' },
        ),
      ],
      [
        'Renew those selected names until 2030-12-12',
        collection(
          'bulk_renew',
          { primary: 'no' },
          {
            names: ['larch.eth', 'tamarind.eth'],
            targetDate: '2030-12-12',
          },
        ),
        'canonical',
        {
          lastNames: ['larch.eth', 'tamarind.eth'],
          lastFilters: { primary: 'no' },
        },
      ],
      [
        'Extend favourite V2 names so they expire on 2031-08-16',
        collection(
          'bulk_renew',
          { favorite: 'yes', version: 'v2' },
          {
            targetDate: '2031-08-16',
          },
        ),
        'paraphrase',
      ],
      [
        'Renew all my names until 2032-01-05',
        collection('bulk_renew', {}, { targetDate: '2032-01-05' }),
      ],
      ['Renew my V2 names to 04/05/2031', unsupported],
      ['Renew my V2 names until', unsupported],
      ['Do not renew favourite names until 2031-04-23', unsupported],
      ['Renew V2 names until 2031-04-23 and add 74 days', unsupported],
      ['Renew V2 names until 2031-04-23 or 2031-05-23', unsupported],
      ['Renew V2 names until 2004-01-01', unsupported],
      ['Renew V2 names until 2031-02-29', unsupported],
      ['Schedule renewal of V2 names on 2031-04-23', unsupported],
      [
        'extnd larch.eth and tamarind.eth to 19 July 2030',
        collection(
          'bulk_renew',
          {},
          {
            names: ['larch.eth', 'tamarind.eth'],
            targetDate: '2030-07-19',
          },
        ),
        'typo',
      ],
      [
        'Renew my non-primary V2 names to 2030-08-06',
        collection(
          'bulk_renew',
          { primary: 'no', version: 'v2' },
          {
            targetDate: '2030-08-06',
          },
        ),
      ],
      [
        'Make the names I manage last until December 21, 2032',
        collection(
          'bulk_renew',
          { role: 'manager' },
          { targetDate: '2032-12-21' },
        ),
        'paraphrase',
      ],
    ],
  },
  {
    key: 'profile',
    family: 'edit_profile',
    rows: [
      [
        'Copy the Ethereum record on larch.eth into its Polygon address',
        reuseEth('larch.eth', 2147483785),
        'paraphrase',
      ],
      [
        'For tamarind.eth, Base should reuse the Ethereum address already saved there',
        reuseEth('tamarind.eth', 2147568180),
        'paraphrase',
      ],
      [
        'The Polgyon address on larch.eth should match its existing Ethereum address',
        reuseEth('larch.eth', 2147483785),
        'typo',
      ],
      [
        'Point the Base record of larch.eth at the address in its Ethereum record',
        reuseEth('larch.eth', 2147568180),
        'paraphrase',
      ],
      [
        'Copy the Ethereum address from larch.eth into another network record on that profile',
        missing('profileNetwork'),
      ],
      [
        'Put https://github.com/larch-tools in the links on larch.eth',
        ready('edit_profile', {
          name: 'larch.eth',
          section: 'links',
          link: { name: 'GitHub', url: 'https://github.com/larch-tools' },
        }),
        'paraphrase',
      ],
      [
        'Set the GitHub contact of larch.eth to larch-tools',
        profile('larch.eth', 'contact', {
          field: 'github',
          value: 'larch-tools',
        }),
      ],
      [
        'On tamarind.eth, call the link currently titled "Notebook" "Journal"',
        profile('tamarind.eth', 'links', {
          field: 'link',
          operation: 'rename',
          value: '',
          linkTarget: 'Notebook',
          linkName: 'Journal',
        }),
        'paraphrase',
      ],
      [
        'For larch.eth change the "Portfolio" link from https://old.example.net/larch to https://new.example.net/larch',
        profile('larch.eth', 'links', {
          field: 'link',
          value: 'https://new.example.net/larch',
          expectedValue: 'https://old.example.net/larch',
          linkName: 'Portfolio',
          linkTarget: 'Portfolio',
        }),
      ],
      [
        'Reuse the current Ethereum address on tamarind.eth for a different network',
        missing('profileNetwork'),
        'paraphrase',
      ],
      [
        'Make the Polygon address use the Ethereum address from the same profile',
        missing('name'),
      ],
      ['Set the GitHub contact on tamarind.eth', missing('profileValue')],
      [
        'Unpn the githb contact on larch.eth',
        profile('larch.eth', 'contact', {
          field: 'github',
          operation: 'unfeature',
          value: '',
        }),
        'typo',
      ],
      [
        'Copy the Bitcoin record on larch.eth into its Ethereum address',
        unsupported,
      ],
      [
        'Do not copy the Ethereum record on larch.eth into its Polygon address',
        unsupported,
      ],
      [
        'Copy the Ethereum address from larch.eth to the Polygon record on tamarind.eth',
        unsupported,
      ],
      [
        'Set larch.eth Polygon address to 0x1111111111111111111111111111111111111111',
        profile('larch.eth', 'addresses', {
          field: 'address',
          coinType: 2147483785,
          value: '0x1111111111111111111111111111111111111111',
        }),
      ],
      [
        'Replace tamarind-old with tamarind-new in the GitHub contact on tamarind.eth',
        profile('tamarind.eth', 'contact', {
          field: 'github',
          expectedValue: 'tamarind-old',
          value: 'tamarind-new',
        }),
        'paraphrase',
      ],
      ['Please add a website link on larch.eth', missing('url')],
      [
        'Base on tamarind.eth shud use its saved Etheruem address',
        reuseEth('tamarind.eth', 2147568180),
        'typo',
      ],
    ],
  },
]

export const RENEWAL_AI_EVAL_CORPUS: readonly AiEvalCase[] = groups.flatMap(
  (group) =>
    group.rows.map(
      ([query, expected, language = 'canonical', inputs], index) => ({
        id: `renewal-${group.key}-${index + 1}`,
        entryPoint: 'ai' as const,
        category:
          expected.status === 'ready'
            ? ('supported' as const)
            : expected.status === 'needs_input'
              ? ('clarification' as const)
              : ('unsupported' as const),
        family:
          expected.status === 'ready' && expected.action.intent === 'find_names'
            ? ('find_names' as const)
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
