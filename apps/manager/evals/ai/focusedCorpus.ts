import type { AiIntent } from '@/features/ai/intent'
import type { PreparedAiAction } from '@/features/ai/prepareAiHandoff'
import type { AiEvalCase, EvalExpected } from './corpus'

// Authored before either interpreter sees these requests. Whole construction
// and scenario groups stay together; no outcome-driven relabeling is allowed.
type FocusedRow = {
  readonly query: string
  readonly family: AiEvalCase['family']
  readonly expected: EvalExpected
  readonly language?: AiEvalCase['language']
  readonly inputs?: AiEvalCase['inputs']
}

type FocusedGroup = {
  readonly id: string
  readonly split: AiEvalCase['split']
  readonly construction: string
  readonly rows: readonly FocusedRow[]
}

const ready = (
  action: PreparedAiAction,
  nextIntent?: AiIntent,
): EvalExpected => ({
  status: 'ready',
  action,
  ...(nextIntent && { nextIntent }),
})
const missing = (field: string): EvalExpected => ({
  status: 'needs_input',
  field,
})
const unsupported: EvalExpected = { status: 'unsupported' }
const manager = (
  kind: Extract<PreparedAiAction, { intent: 'manager_action' }>['kind'],
  details: Omit<
    Extract<PreparedAiAction, { intent: 'manager_action' }>,
    'intent' | 'kind'
  > = {},
): EvalExpected => ready({ intent: 'manager_action', kind, ...details })
const profile = (
  name: string,
  section: Extract<PreparedAiAction, { intent: 'edit_profile' }>['section'],
  proposal: NonNullable<
    Extract<PreparedAiAction, { intent: 'edit_profile' }>['proposal']
  >,
): EvalExpected => ready({ intent: 'edit_profile', name, section, proposal })

const groups: readonly FocusedGroup[] = [
  {
    id: 'direct-target',
    split: 'development',
    construction:
      'Explicit imperative, single target or ordered two-action request',
    rows: [
      {
        query: 'Make marigold.eth my primary ENS name',
        family: 'set_primary',
        expected: ready({ intent: 'set_primary', name: 'marigold.eth' }),
      },
      {
        query:
          'Register copperleaf.eth for fifty-six days, then make it primary',
        family: 'register',
        expected: ready(
          { intent: 'register', name: 'copperleaf.eth', durationDays: 56 },
          'set_primary',
        ),
      },
      {
        query: 'Renew birchwood.eth for three years',
        family: 'renew',
        expected: ready({
          intent: 'renew',
          name: 'birchwood.eth',
          durationYears: 3,
        }),
      },
      {
        query: 'Add wildrose.eth to my favourites',
        family: 'favorite',
        expected: ready({ intent: 'favorite', name: 'wildrose.eth' }),
      },
      {
        query: 'Show the ENS profile for bluefern.eth',
        family: 'view_name',
        expected: ready({ intent: 'view_name', name: 'bluefern.eth' }),
      },
    ],
  },
  {
    id: 'literal-assignment',
    split: 'development',
    construction:
      'Direct field assignment with exact values and explicit old/new replacement',
    rows: [
      {
        query: 'Change marigold.eth GitHub from amber-old to amber-new',
        family: 'edit_profile',
        expected: profile('marigold.eth', 'contact', {
          field: 'github',
          expectedValue: 'amber-old',
          value: 'amber-new',
        }),
      },
      {
        query:
          'Set bluefern.eth description to "Keep moving; never renew automatically."',
        family: 'edit_profile',
        expected: profile('bluefern.eth', 'general', {
          field: 'description',
          value: 'Keep moving; never renew automatically.',
        }),
      },
      {
        query: 'Set copperleaf.eth contact email to hello@example.net',
        family: 'edit_profile',
        expected: profile('copperleaf.eth', 'contact', {
          field: 'email',
          value: 'hello@example.net',
        }),
      },
      {
        query: 'Set wildrose.eth avatar to https://example.org/art/rose.webp',
        family: 'edit_profile',
        expected: profile('wildrose.eth', 'general', {
          field: 'avatar',
          value: 'https://example.org/art/rose.webp',
        }),
      },
      {
        query: 'Add https://example.net/notes to the links of birchwood.eth',
        family: 'edit_profile',
        expected: ready({
          intent: 'edit_profile',
          name: 'birchwood.eth',
          section: 'links',
          link: { name: 'Link', url: 'https://example.net/notes' },
        }),
      },
    ],
  },
  {
    id: 'collection-conjunction',
    split: 'development',
    construction:
      'Positive AND collection facets, explicit selection and added duration',
    rows: [
      {
        query: 'Find my V1 manager names expiring within eighteen days',
        family: 'find_names',
        expected: ready({
          intent: 'find_names',
          filters: {
            version: 'v1',
            role: 'manager',
            expiry: 'expiring',
            withinDays: 18,
          },
        }),
      },
      {
        query: 'Renew my favourite V2 names for fifty-six days',
        family: 'bulk_renew',
        expected: ready({
          intent: 'bulk_renew',
          filters: { version: 'v2', favorite: 'yes' },
          durationDays: 56,
        }),
      },
      {
        query: 'Show my primary name and sort by expiry date ascending',
        family: 'find_names',
        expected: ready({
          intent: 'find_names',
          filters: { primary: 'yes', sort: 'expiry-asc' },
        }),
      },
      {
        query:
          'Upgrade eligible V1 names except those needing manager restoration',
        family: 'migrate',
        expected: ready({ intent: 'migrate', excludeManagerRestoration: true }),
      },
      {
        query: 'Renew marigold.eth and bluefern.eth for ninety days',
        family: 'bulk_renew',
        expected: ready({
          intent: 'bulk_renew',
          filters: {},
          names: ['marigold.eth', 'bluefern.eth'],
          durationDays: 90,
        }),
      },
    ],
  },
  {
    id: 'account-direction',
    split: 'development',
    construction:
      'Explicit channel or preference direction and named interface language',
    rows: [
      {
        query: 'Turn off browser push notifications',
        family: 'manager_action',
        expected: manager('push_disable'),
      },
      {
        query: 'Add notifications@example.org as my notification email',
        family: 'manager_action',
        expected: manager('email_add', { email: 'notifications@example.org' }),
      },
      {
        query: 'Connect Telegram for ENS notifications',
        family: 'manager_action',
        expected: manager('telegram_connect'),
      },
      {
        query: 'Enable expiry alerts for names I own',
        family: 'notification',
        expected: ready({
          intent: 'notification',
          preference: 'ownedNameExpiry',
          enabled: true,
        }),
      },
      {
        query: 'Switch Manager to Swedish',
        family: 'manager_action',
        expected: manager('language', { locale: 'sv' }),
      },
    ],
  },
  {
    id: 'omitted-required-slot',
    split: 'development',
    construction: 'Explicit action and resource with one absent required slot',
    rows: [
      {
        query: 'Set my primary ENS name',
        family: 'set_primary',
        expected: missing('name'),
      },
      {
        query: 'Register a name for sixty days',
        family: 'register',
        expected: missing('name'),
      },
      {
        query: 'Register goldenreed.eth',
        family: 'register',
        expected: missing('durationDays'),
      },
      {
        query: 'Change marigold.eth GitHub handle',
        family: 'edit_profile',
        expected: missing('profileValue'),
      },
      {
        query: 'Revoke one of my migration permissions',
        family: 'manager_action',
        expected: missing('managerValue'),
      },
    ],
  },
  {
    id: 'imperative-negation',
    split: 'development',
    construction: 'A single action is explicitly negated',
    rows: [
      {
        query: 'Do not renew birchwood.eth for ten days',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Never remove my Telegram notification contact',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: "Don't change copperleaf.eth email to changed@example.net",
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Do not set marigold.eth as primary',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Never register winterreed.eth for thirty days',
        family: 'safety',
        expected: unsupported,
      },
    ],
  },
  {
    id: 'unsupported-qualifier',
    split: 'development',
    construction:
      'Otherwise supported action with a mandatory unsupported qualifier',
    rows: [
      {
        query:
          'Renew bluefern.eth for thirty days only if gas costs less than one dollar',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Share wildrose.eth with my accountant by email',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Remind me about favourite name expiry every six hours',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Download my commemorative NFT as an SVG file',
        family: 'safety',
        expected: unsupported,
      },
      {
        query: 'Change Manager interface language to German',
        family: 'safety',
        expected: unsupported,
      },
    ],
  },
  {
    id: 'instruction-typos',
    split: 'development',
    construction:
      'Misspelled operation or field with intact exact target and value',
    rows: [
      {
        query: 'unstar the twiter account for bluefern.eth',
        family: 'edit_profile',
        language: 'typo',
        expected: profile('bluefern.eth', 'contact', {
          field: 'twitter',
          operation: 'unfeature',
          value: '',
        }),
      },
      {
        query: 'extnd copperleaf.eth by twelve days',
        family: 'renew',
        language: 'typo',
        expected: ready({
          intent: 'renew',
          name: 'copperleaf.eth',
          durationDays: 12,
        }),
      },
      {
        query: 'shrae wildrose.eth profile',
        family: 'manager_action',
        language: 'typo',
        expected: manager('share_profile', { name: 'wildrose.eth' }),
      },
      {
        query: 'regster birchtrail.eth for 42 days',
        family: 'register',
        language: 'typo',
        expected: ready({
          intent: 'register',
          name: 'birchtrail.eth',
          durationDays: 42,
        }),
      },
      {
        query: 'set marigold.eth githb to mariglod-dev',
        family: 'edit_profile',
        language: 'typo',
        expected: profile('marigold.eth', 'contact', {
          field: 'github',
          value: 'mariglod-dev',
        }),
      },
    ],
  },
  {
    id: 'possessive-account-resource',
    split: 'heldout',
    construction:
      'Possessive/deictic account resource requests across previously absent action kinds',
    rows: [
      {
        query: "I'd like to see the ENS names belonging to my connected wallet",
        family: 'manager_action',
        expected: manager('view_address', { ownWallet: true }),
      },
      {
        query: "I'd like my wallet address on the clipboard",
        family: 'manager_action',
        expected: manager('wallet_copy'),
      },
      {
        query: "I'd like this wallet disconnected from Manager",
        family: 'manager_action',
        expected: manager('wallet_disconnect'),
      },
      {
        query: "I'd like to claim the commemorative NFT for my ENS migration",
        family: 'manager_action',
        expected: manager('nft_claim'),
      },
      {
        query: "I'd like to review the operator approvals for my name upgrades",
        family: 'manager_action',
        expected: manager('migration_permissions'),
      },
    ],
  },
  {
    id: 'contrasted-resource-role',
    split: 'heldout',
    construction:
      'Contrastive value roles, alternatives, and incomplete resource destinations',
    rows: [
      {
        query:
          'For silverbell.eth, use silver-new instead of silver-old as the GitHub handle',
        family: 'edit_profile',
        expected: profile('silverbell.eth', 'contact', {
          field: 'github',
          value: 'silver-new',
          expectedValue: 'silver-old',
        }),
      },
      {
        query:
          'The link called "Field notes" on foxglove.eth should instead be titled "Journal"',
        family: 'edit_profile',
        expected: profile('foxglove.eth', 'links', {
          field: 'link',
          operation: 'rename',
          linkTarget: 'Field notes',
          linkName: 'Journal',
          value: '',
        }),
      },
      {
        query: 'Share either silverbell.eth or foxglove.eth',
        family: 'manager_action',
        expected: missing('name'),
      },
      {
        query:
          'Use the saved Ethereum record of foxglove.eth for a different network',
        family: 'edit_profile',
        expected: missing('profileNetwork'),
      },
      {
        query:
          'For silverbell.eth, use the Ethereum address from foxglove.eth as its Polygon address',
        family: 'safety',
        expected: unsupported,
      },
    ],
  },
  {
    id: 'temporal-role-composition',
    split: 'heldout',
    construction:
      'Expiry selection windows, added durations, absolute targets and scheduling contrasts',
    rows: [
      {
        query:
          'For V2 names due to expire within twenty-three days, add seven weeks',
        family: 'bulk_renew',
        expected: ready({
          intent: 'bulk_renew',
          filters: { version: 'v2', expiry: 'expiring', withinDays: 23 },
          durationDays: 49,
        }),
      },
      {
        query:
          'I need foxglove.eth renewed so that its expiry becomes 9 September 2034',
        family: 'renew',
        expected: ready({
          intent: 'renew',
          name: 'foxglove.eth',
          targetDate: '2034-09-09',
        }),
      },
      {
        query: 'For the names in my previous result, add forty-two days',
        family: 'bulk_renew',
        inputs: {
          lastNames: ['silverbell.eth', 'foxglove.eth'],
          lastFilters: { version: 'v2', role: 'owner' },
        },
        expected: ready({
          intent: 'bulk_renew',
          names: ['silverbell.eth', 'foxglove.eth'],
          filters: { version: 'v2', role: 'owner' },
          durationDays: 42,
        }),
      },
      {
        query:
          'For silverbell.eth, perform a thirty-day renewal tomorrow morning',
        family: 'safety',
        expected: unsupported,
      },
      {
        query:
          'For V2 names due to expire in less than twenty-three days, add seven weeks but skip ones with a profile avatar',
        family: 'safety',
        expected: unsupported,
      },
    ],
  },
  {
    id: 'exact-management-resource',
    split: 'heldout',
    construction:
      'Precise managed resource, delivery context, or supported file identity',
    rows: [
      {
        query:
          'The wrapped ENSv1 Name Wrapper approval is the migration permission I want revoked',
        family: 'manager_action',
        expected: manager('migration_revoke', { approval: 'name-wrapper:hca' }),
      },
      {
        query: 'Unstar the Twitter contact of foxglove.eth',
        family: 'edit_profile',
        expected: profile('foxglove.eth', 'contact', {
          field: 'twitter',
          operation: 'unfeature',
          value: '',
        }),
      },
      {
        query:
          'My minted migration NFT artwork is what I want saved locally as WebP',
        family: 'manager_action',
        expected: manager('nft_download'),
      },
      {
        query:
          'The notification inbox should show only unread transfer notifications',
        family: 'manager_action',
        expected: manager('show_notifications', {
          unreadOnly: true,
          notificationTag: 'transfer',
        }),
      },
      {
        query:
          'The notification inbox should show only items mentioning silverbell.eth',
        family: 'safety',
        expected: unsupported,
      },
    ],
  },
]

export const FOCUSED_AI_EVAL_GROUPS = groups.map(
  ({ id, split, construction, rows }) => ({
    id,
    split,
    construction,
    count: rows.length,
  }),
)

export const FOCUSED_AI_EVAL_CORPUS: readonly (AiEvalCase & {
  readonly constructionGroup: string
})[] = groups.flatMap(({ id, split, rows }) =>
  rows.map((row, index) => ({
    id: `focused-${id}-${index + 1}`,
    entryPoint: 'ai' as const,
    category:
      row.expected.status === 'ready'
        ? ('supported' as const)
        : row.expected.status === 'needs_input'
          ? ('clarification' as const)
          : ('unsupported' as const),
    language: row.language ?? 'paraphrase',
    split,
    constructionGroup: id,
    family: row.family,
    query: row.query,
    expected: row.expected,
    ...(row.inputs && { inputs: row.inputs }),
    smoke: split === 'development' && index === 0,
  })),
)
