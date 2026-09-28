import type { AiIntent } from '@/features/ai/intent'
import type { AiHandoffInputs } from '@/features/ai/prepareAiHandoff'
import type { AiEvalCase } from './corpus'

// Authored before observing provider output. These labels describe the requested
// outcome, including cases the frozen implementation may fail to understand.
// Every fifth case is held out. Keep that partition and the first score intact.
type Row = readonly [
  query: string,
  details: Record<string, unknown>,
  language?: AiEvalCase['language'],
  inputs?: AiHandoffInputs,
  nextIntent?: AiIntent,
]
const profile = (
  name: string,
  section: string,
  field: string,
  value: string,
  expectedValue?: string,
) => ({
  name,
  section,
  proposal: {
    field,
    value,
    ...(expectedValue === undefined ? {} : { expectedValue }),
  },
})

const supportedGroups = {
  set_primary: [
    ['Make orbit.eth my primary ENS name', { name: 'orbit.eth' }],
    [
      'My wallet should show mint-tea.eth as its name',
      { name: 'mint-tea.eth' },
      'paraphrase',
    ],
    [
      'Could we switch my main name over to nebula.eth?',
      { name: 'nebula.eth' },
      'paraphrase',
    ],
    ['plese make copper.eth my primray name', { name: 'copper.eth' }, 'typo'],
    [
      'Use studio.river.eth for my reverse record',
      { name: 'studio.river.eth' },
      'paraphrase',
    ],
    ['Set LANTERN.ETH as primary for this wallet.', { name: 'lantern.eth' }],
    [
      'I want my account to be known as meadow.eth',
      { name: 'meadow.eth' },
      'paraphrase',
    ],
    [
      'Pick comet.eth as the ENS name displayed for my wallet',
      { name: 'comet.eth' },
      'paraphrase',
    ],
    [
      'Can you make café.eth my main ENS name please?',
      { name: 'café.eth' },
      'paraphrase',
    ],
    ['set aurora.eth as my primry pls', { name: 'aurora.eth' }, 'typo'],
    [
      'For my wallet display name, use cloud-nine.eth',
      { name: 'cloud-nine.eth' },
      'paraphrase',
    ],
    ['Change the primary ENS name to fern.eth', { name: 'fern.eth' }],
    [
      'I would like 🌈.eth to be my primary name',
      { name: '🌈.eth' },
      'paraphrase',
    ],
    [
      'Set my primary to coral.eth, not pebble.eth',
      { name: 'coral.eth' },
      'paraphrase',
    ],
    [
      'The name I want as primary is harbor.eth',
      { name: 'harbor.eth' },
      'paraphrase',
    ],
    [
      'For this connected wallet, make velvet.eth the primary name',
      { name: 'velvet.eth' },
      'paraphrase',
    ],
  ],
  register: [
    ['Register orbit.eth for 46 days', { name: 'orbit.eth', durationDays: 46 }],
    [
      'Can I get mint-tea.eth for eight weeks?',
      { name: 'mint-tea.eth', durationDays: 56 },
      'paraphrase',
    ],
    [
      'Please register nebula.eth for three years',
      { name: 'nebula.eth', durationDays: 1095 },
      'paraphrase',
    ],
    [
      'regster copper.eth for 55 days plz',
      { name: 'copper.eth', durationDays: 55 },
      'typo',
    ],
    [
      'I want to claim lantern.eth for one year',
      { name: 'lantern.eth', durationDays: 365 },
      'paraphrase',
    ],
    [
      'Get me meadow.eth for 100 days',
      { name: 'meadow.eth', durationDays: 100 },
      'paraphrase',
    ],
    [
      'Register comet.eth for four weeks',
      { name: 'comet.eth', durationDays: 28 },
    ],
    [
      'I would like a new registration of café.eth for 180 days',
      { name: 'café.eth', durationDays: 180 },
      'paraphrase',
    ],
    [
      'Could you register aurora.eth for 400 days?',
      { name: 'aurora.eth', durationDays: 400 },
      'paraphrase',
    ],
    [
      'regitser cloud-nine.eth for 70 days',
      { name: 'cloud-nine.eth', durationDays: 70 },
      'typo',
    ],
    [
      'Register fern.eth for thirty days',
      { name: 'fern.eth', durationDays: 30 },
    ],
    [
      'I want coral.eth registered for five years',
      { name: 'coral.eth', durationDays: 1825 },
      'paraphrase',
    ],
    [
      'Register harbor.eth for 35 days, then make it primary',
      { name: 'harbor.eth', durationDays: 35 },
      'paraphrase',
      undefined,
      'set_primary',
    ],
    [
      'Please register VELVET.eth for 31 days.',
      { name: 'velvet.eth', durationDays: 31 },
    ],
    [
      'Can we register sakura.eth for ten weeks?',
      { name: 'sakura.eth', durationDays: 70 },
      'paraphrase',
    ],
    [
      'Register opal.eth for 60 days instead of 40 days',
      { name: 'opal.eth', durationDays: 60 },
      'paraphrase',
    ],
  ],
  renew: [
    ['Extend orbit.eth by 11 days', { name: 'orbit.eth', durationDays: 11 }],
    [
      'I need mint-tea.eth to last another three weeks',
      { name: 'mint-tea.eth', durationDays: 21 },
      'paraphrase',
    ],
    [
      'Renew nebula.eth for four years please',
      { name: 'nebula.eth', durationYears: 4 },
      'paraphrase',
    ],
    [
      'renwe copper.eth for 17 days',
      { name: 'copper.eth', durationDays: 17 },
      'typo',
    ],
    [
      'Add another year to lantern.eth',
      { name: 'lantern.eth', durationYears: 1 },
      'paraphrase',
    ],
    [
      'Keep meadow.eth for 90 more days',
      { name: 'meadow.eth', durationDays: 90 },
      'paraphrase',
    ],
    [
      'Could you extend comet.eth by six weeks?',
      { name: 'comet.eth', durationDays: 42 },
      'paraphrase',
    ],
    ['Renew café.eth for 2 days', { name: 'café.eth', durationDays: 2 }],
    [
      'Top up aurora.eth with another two years',
      { name: 'aurora.eth', durationYears: 2 },
      'paraphrase',
    ],
    [
      'extned cloud-nine.eth for 12 days pls',
      { name: 'cloud-nine.eth', durationDays: 12 },
      'typo',
    ],
    ['Renew fern.eth for twenty days', { name: 'fern.eth', durationDays: 20 }],
    [
      'Put five more weeks on coral.eth',
      { name: 'coral.eth', durationDays: 35 },
      'paraphrase',
    ],
    [
      'I want harbor.eth renewed for 365 days',
      { name: 'harbor.eth', durationDays: 365 },
      'paraphrase',
    ],
    [
      'For VELVET.ETH, add 18 days to the registration',
      { name: 'velvet.eth', durationDays: 18 },
      'paraphrase',
    ],
    [
      'Extend sakura.eth for another seven years',
      { name: 'sakura.eth', durationYears: 7 },
    ],
    [
      'Renew opal.eth for 45 days rather than 15 days',
      { name: 'opal.eth', durationDays: 45 },
      'paraphrase',
    ],
  ],
  find_names: [
    [
      'Which of my V2 names expire within 12 days?',
      { filters: { version: 'v2', expiry: 'expiring', withinDays: 12 } },
      'paraphrase',
    ],
    [
      'Show owned names still in grace, alphabetically',
      { filters: { role: 'owner', expiry: 'in-grace', sort: 'name-asc' } },
    ],
    [
      'List favorites whose grace period is over',
      { filters: { favorite: 'yes', expiry: 'past-grace' } },
      'paraphrase',
    ],
    [
      'shwo my active v1 nmaes',
      { filters: { expiry: 'active', version: 'v1' } },
      'typo',
    ],
    [
      'Find non-expiring names I manage',
      { filters: { expiry: 'non-expiring', role: 'manager' } },
    ],
    [
      'Which names are my primary names?',
      { filters: { primary: 'yes' } },
      'paraphrase',
    ],
    [
      'List V1 names that cannot upgrade',
      { filters: { version: 'v1', upgrade: 'ineligible' } },
    ],
    [
      'Names I own, newest registrations first',
      { filters: { role: 'owner', sort: 'created-desc' } },
      'paraphrase',
    ],
    [
      'Show non-favorites expiring within 120 days',
      { filters: { favorite: 'no', expiry: 'expiring', withinDays: 120 } },
    ],
    [
      'find v2 favrites with soonest expriy first',
      { filters: { version: 'v2', favorite: 'yes', sort: 'expiry-asc' } },
      'typo',
    ],
    [
      'Show names I manage except primary names',
      { filters: { role: 'manager', primary: 'no' } },
    ],
    [
      'List my active names, reverse alphabetical order',
      { filters: { expiry: 'active', sort: 'name-desc' } },
    ],
    [
      'Give me V1 names eligible for upgrade, oldest first',
      { filters: { version: 'v1', upgrade: 'eligible', sort: 'created-asc' } },
      'paraphrase',
    ],
    [
      'Which names expire soon and are not favorites?',
      { filters: { expiry: 'expiring', favorite: 'no' } },
      'paraphrase',
    ],
    [
      'Show favorite V2 names that I own',
      { filters: { favorite: 'yes', version: 'v2', role: 'owner' } },
    ],
    [
      'List names outside grace that have already expired',
      { filters: { expiry: 'past-grace' } },
      'paraphrase',
    ],
  ],
  bulk_renew: [
    [
      'Extend the names I own that expire within 21 days',
      { filters: { role: 'owner', expiry: 'expiring', withinDays: 21 } },
      'paraphrase',
    ],
    [
      'Renew all my V2 favorites',
      { filters: { version: 'v2', favorite: 'yes' } },
    ],
    [
      'Please renew names still in their grace period',
      { filters: { expiry: 'in-grace' } },
      'paraphrase',
    ],
    [
      'renwe my active v1 names',
      { filters: { expiry: 'active', version: 'v1' } },
      'typo',
    ],
    [
      'Extend my names that are not favorites',
      { filters: { favorite: 'no' } },
      'paraphrase',
    ],
    [
      'Renew the names I manage that expire soon',
      { filters: { role: 'manager', expiry: 'expiring' } },
    ],
    [
      'Renew those',
      { filters: { version: 'v2', favorite: 'yes' } },
      'paraphrase',
      { lastFilters: { version: 'v2', favorite: 'yes' } },
    ],
    ['Extend my primary names', { filters: { primary: 'yes' } }, 'paraphrase'],
    [
      'Renew V2 names expiring within 75 days',
      { filters: { version: 'v2', expiry: 'expiring', withinDays: 75 } },
    ],
    [
      'extnd names i own in graec',
      { filters: { role: 'owner', expiry: 'in-grace' } },
      'typo',
    ],
    [
      'Renew those names excluding my primary',
      { filters: { role: 'owner', primary: 'no' } },
      'paraphrase',
      { lastFilters: { role: 'owner' } },
    ],
    [
      'Take my favorite names through renewal',
      { filters: { favorite: 'yes' } },
      'paraphrase',
    ],
    [
      'Renew my V1 names that are not primary',
      { filters: { version: 'v1', primary: 'no' } },
    ],
    [
      'Add time to the names I manage',
      { filters: { role: 'manager' } },
      'paraphrase',
    ],
    [
      'Please extend all owned V2 names',
      { filters: { role: 'owner', version: 'v2' } },
      'paraphrase',
    ],
    [
      'Renew those names within 14 days of expiring',
      { filters: { favorite: 'yes', expiry: 'expiring', withinDays: 14 } },
      'paraphrase',
      { lastFilters: { favorite: 'yes' } },
    ],
  ],
  migrate: [
    [
      'Upgrade my eligible names to ENSv2',
      { excludeManagerRestoration: false },
    ],
    [
      'Move over my V1 names but skip manager restoration',
      { excludeManagerRestoration: true },
      'paraphrase',
    ],
    [
      'Can you start migrating my old ENS names?',
      { excludeManagerRestoration: false },
      'paraphrase',
    ],
    [
      'migrte my eligble v1 names',
      { excludeManagerRestoration: false },
      'typo',
    ],
    [
      'Upgrade eligible V1 names without restoring managers',
      { excludeManagerRestoration: true },
    ],
    [
      'Help me take my names from ENS version one to version two',
      { excludeManagerRestoration: false },
      'paraphrase',
    ],
    [
      'Start the migration for names eligible for ENSv2',
      { excludeManagerRestoration: false },
    ],
    [
      'I want to upgrade names; leave out anything that needs manager restoration',
      { excludeManagerRestoration: true },
      'paraphrase',
    ],
    [
      'Take me through the V1 to V2 name upgrade',
      { excludeManagerRestoration: false },
      'paraphrase',
    ],
    [
      'upgarde v1 names excludng manager restoration',
      { excludeManagerRestoration: true },
      'typo',
    ],
    [
      'Migrate every eligible old-version name',
      { excludeManagerRestoration: false },
    ],
    [
      'Bring my ENSv1 names into ENSv2 please',
      { excludeManagerRestoration: false },
      'paraphrase',
    ],
    [
      'Upgrade names that qualify, except those requiring their manager restored',
      { excludeManagerRestoration: true },
      'paraphrase',
    ],
    [
      'Launch migration for my V1 ENS names',
      { excludeManagerRestoration: false },
    ],
    [
      'Can we upgrade eligible names and avoid the manager-restoration ones?',
      { excludeManagerRestoration: true },
      'paraphrase',
    ],
    [
      'I am ready to migrate my ENS names to version 2',
      { excludeManagerRestoration: false },
      'paraphrase',
    ],
  ],
  edit_profile: [
    [
      'Set orbit.eth GitHub to star-sailor instead of old-orbit',
      profile('orbit.eth', 'contact', 'github', 'star-sailor', 'old-orbit'),
    ],
    [
      'Change mint-tea.eth description to "Tea, code & quiet mornings."',
      profile(
        'mint-tea.eth',
        'general',
        'description',
        'Tea, code & quiet mornings.',
      ),
      'paraphrase',
    ],
    [
      'Set nebula.eth email to hello+ens@example.org',
      profile('nebula.eth', 'contact', 'email', 'hello+ens@example.org'),
    ],
    [
      'set copper.eth githb to copper-dev',
      profile('copper.eth', 'contact', 'github', 'copper-dev'),
      'typo',
    ],
    [
      'Use https://example.org/images/lamp.webp as lantern.eth avatar',
      profile(
        'lantern.eth',
        'general',
        'avatar',
        'https://example.org/images/lamp.webp',
      ),
      'paraphrase',
    ],
    [
      'Set meadow.eth Ethereum address to 0x1111111111111111111111111111111111111111',
      profile(
        'meadow.eth',
        'addresses',
        'eth_address',
        '0x1111111111111111111111111111111111111111',
      ),
    ],
    [
      'Add https://example.net/portfolio to comet.eth links',
      {
        name: 'comet.eth',
        section: 'links',
        link: { name: 'Link', url: 'https://example.net/portfolio' },
      },
    ],
    [
      'Open the appearance editor for café.eth',
      { name: 'café.eth', section: 'appearance' },
      'paraphrase',
    ],
    [
      'Set aurora.eth GitHub username to @aurora-builds',
      profile('aurora.eth', 'contact', 'github', 'aurora-builds'),
    ],
    [
      'edti cloud-nine.eth descripton to "Cloud watcher"',
      profile('cloud-nine.eth', 'general', 'description', 'Cloud watcher'),
      'typo',
    ],
    [
      'Change fern.eth email to fern@example.com instead of old@example.com',
      profile(
        'fern.eth',
        'contact',
        'email',
        'fern@example.com',
        'old@example.com',
      ),
      'paraphrase',
    ],
    [
      'Show me the address editor for coral.eth',
      { name: 'coral.eth', section: 'addresses' },
      'paraphrase',
    ],
    [
      'Set harbor.eth GitHub to https://github.com/harbor-dev',
      profile('harbor.eth', 'contact', 'github', 'harbor-dev'),
    ],
    [
      'Add https://github.com/velvet-labs as a link on velvet.eth',
      {
        name: 'velvet.eth',
        section: 'links',
        link: { name: 'GitHub', url: 'https://github.com/velvet-labs' },
      },
    ],
    [
      'Change sakura.eth theme to Garnet',
      profile('sakura.eth', 'appearance', 'theme', '#E72A96'),
      'paraphrase',
    ],
    [
      'Set the bio of opal.eth to "I build small things for humans"',
      profile(
        'opal.eth',
        'general',
        'description',
        'I build small things for humans',
      ),
      'paraphrase',
    ],
  ],
  notification: [
    [
      'Enable expiration alerts for names I own',
      { preference: 'ownedNameExpiry', enabled: true },
    ],
    [
      'Please stop expiry reminders for favorites',
      { preference: 'favouritedNameExpiry', enabled: false },
      'paraphrase',
    ],
    [
      'Keep me informed about ENS Labs news',
      { preference: 'ensLabsUpdates', enabled: true },
      'paraphrase',
    ],
    [
      'enabel own name expiery notifications',
      { preference: 'ownedNameExpiry', enabled: true },
      'typo',
    ],
    [
      'Unsubscribe me from ENS Labs updates',
      { preference: 'ensLabsUpdates', enabled: false },
      'paraphrase',
    ],
    [
      'Turn favourite name expiration alerts back on',
      { preference: 'favouritedNameExpiry', enabled: true },
      'paraphrase',
    ],
    [
      'Switch off expiration emails for names I own',
      { preference: 'ownedNameExpiry', enabled: false },
      'paraphrase',
    ],
    [
      'I want reminders when my favorite names expire',
      { preference: 'favouritedNameExpiry', enabled: true },
      'paraphrase',
    ],
    [
      'Mute ENS Labs announcements',
      { preference: 'ensLabsUpdates', enabled: false },
      'paraphrase',
    ],
    [
      'disabel favrite expiration remnders',
      { preference: 'favouritedNameExpiry', enabled: false },
      'typo',
    ],
    [
      'Subscribe to owned-name expiry reminders',
      { preference: 'ownedNameExpiry', enabled: true },
    ],
    [
      'Switch ENS Labs updates on',
      { preference: 'ensLabsUpdates', enabled: true },
    ],
    [
      'I do not want owned name expiry notifications anymore',
      { preference: 'ownedNameExpiry', enabled: false },
      'paraphrase',
    ],
    [
      'Resume reminders about favorites expiring',
      { preference: 'favouritedNameExpiry', enabled: true },
      'paraphrase',
    ],
    [
      'Turn ENS Labs news notifications off please',
      { preference: 'ensLabsUpdates', enabled: false },
    ],
    [
      'Disable alerts about the expiration of names I own',
      { preference: 'ownedNameExpiry', enabled: false },
      'paraphrase',
    ],
  ],
  favorite: [
    ['Favourite orbit.eth for me', { name: 'orbit.eth' }],
    [
      'Put mint-tea.eth in my favorite names',
      { name: 'mint-tea.eth' },
      'paraphrase',
    ],
    ['Would you star nebula.eth?', { name: 'nebula.eth' }, 'paraphrase'],
    ['favortie copper.eth please', { name: 'copper.eth' }, 'typo'],
    ['Save lantern.eth as a favourite', { name: 'lantern.eth' }, 'paraphrase'],
    ['Bookmark meadow.eth in Manager', { name: 'meadow.eth' }, 'paraphrase'],
    [
      'I want comet.eth on my favourites list',
      { name: 'comet.eth' },
      'paraphrase',
    ],
    [
      'Can you add café.eth to my favorites?',
      { name: 'café.eth' },
      'paraphrase',
    ],
    [
      'Make aurora.eth one of my favourite names',
      { name: 'aurora.eth' },
      'paraphrase',
    ],
    ['starr cloud-nine.eth plz', { name: 'cloud-nine.eth' }, 'typo'],
    ['Please favorite FERN.ETH.', { name: 'fern.eth' }],
    [
      'Add coral.eth, not pebble.eth, to my favorites',
      { name: 'coral.eth' },
      'paraphrase',
    ],
    ['Star the ENS name harbor.eth', { name: 'harbor.eth' }],
    [
      'Put studio.velvet.eth on the favorites list',
      { name: 'studio.velvet.eth' },
      'paraphrase',
    ],
    ['Save 🌻.eth to my favourite names', { name: '🌻.eth' }, 'paraphrase'],
    ['I would like opal.eth bookmarked', { name: 'opal.eth' }, 'paraphrase'],
  ],
  view_name: [
    ['Open orbit.eth in Manager', { name: 'orbit.eth' }],
    [
      'Can I see the profile for mint-tea.eth?',
      { name: 'mint-tea.eth' },
      'paraphrase',
    ],
    ['Bring up nebula.eth please', { name: 'nebula.eth' }, 'paraphrase'],
    ['opne copper.eth', { name: 'copper.eth' }, 'typo'],
    ['Navigate to lantern.eth', { name: 'lantern.eth' }, 'paraphrase'],
    ['I want to look at meadow.eth', { name: 'meadow.eth' }, 'paraphrase'],
    ['Show the ENS profile of comet.eth', { name: 'comet.eth' }],
    ['Take me to café.eth please', { name: 'café.eth' }, 'paraphrase'],
    ['Let us view aurora.eth', { name: 'aurora.eth' }, 'paraphrase'],
    ['shwo cloud-nine.eth profile', { name: 'cloud-nine.eth' }, 'typo'],
    ['Could you display FERN.ETH?', { name: 'fern.eth' }, 'paraphrase'],
    [
      'Open coral.eth rather than pebble.eth',
      { name: 'coral.eth' },
      'paraphrase',
    ],
    ['Show studio.harbor.eth', { name: 'studio.harbor.eth' }],
    ['View 🌊.eth', { name: '🌊.eth' }],
    [
      'I would like to inspect sakura.eth profile',
      { name: 'sakura.eth' },
      'paraphrase',
    ],
    ['Jump to opal.eth', { name: 'opal.eth' }, 'paraphrase'],
  ],
} satisfies Record<string, readonly Row[]>

const supported = Object.entries(supportedGroups).flatMap(
  ([family, rows], groupIndex) =>
    (rows as readonly Row[]).map(
      (
        [query, details, language = 'canonical', inputs, nextIntent],
        index,
      ): AiEvalCase => ({
        id: `fresh-${family}-${index + 1}`,
        entryPoint: 'ai',
        category: 'supported',
        language,
        split:
          (groupIndex * 16 + index + 1) % 5 === 0 ? 'heldout' : 'development',
        family: family as AiIntent,
        query,
        expected: {
          status: 'ready',
          action: { intent: family, ...details },
          ...(nextIntent && { nextIntent }),
        },
        ...(inputs && { inputs }),
        smoke: index === 0,
      }),
    ),
)

const clarificationRows: readonly (readonly [string, string, AiIntent])[] = [
  ['I want a different primary name', 'name', 'set_primary'],
  ['Make orbit.eth or meadow.eth primary', 'name', 'set_primary'],
  ['Register a new ENS name for eight weeks', 'name', 'register'],
  ['Please register lantern.eth', 'durationDays', 'register'],
  ['Register fern.eth for 42', 'durationUnit', 'register'],
  ['Extend another name for 21 days', 'name', 'renew'],
  ['Please extend comet.eth', 'durationYears', 'renew'],
  ['Renew aurora.eth for 12', 'durationUnit', 'renew'],
  ['Renew orbit.eth or mint-tea.eth for three years', 'name', 'renew'],
  ['Add a name to my favorites', 'name', 'favorite'],
  ['Star meadow.eth or coral.eth', 'name', 'favorite'],
  ['Bring up an ENS profile', 'name', 'view_name'],
  ['Show comet.eth or fern.eth', 'name', 'view_name'],
  ['Set the GitHub username of nebula.eth', 'profileValue', 'edit_profile'],
  ['Change copper.eth description', 'profileValue', 'edit_profile'],
  ['Update the avatar on lantern.eth', 'profileValue', 'edit_profile'],
  ['Replace meadow.eth contact email', 'profileValue', 'edit_profile'],
  ['Set comet.eth ETH address', 'profileValue', 'edit_profile'],
  ['Switch the theme for aurora.eth', 'profileValue', 'edit_profile'],
  ['Add a website link to cloud-nine.eth', 'url', 'edit_profile'],
  ['Set my GitHub username to fern-dev', 'name', 'edit_profile'],
  ['Change my contact email to coral@example.org', 'name', 'edit_profile'],
  ['Edit a record on harbor.eth', 'profileField', 'edit_profile'],
  [
    'Change the settings for expiry notifications',
    'notificationPreference',
    'notification',
  ],
  ['Turn alerts off', 'notificationPreference', 'notification'],
  ['Adjust my ENS Labs updates', 'notificationEnabled', 'notification'],
  [
    'Change notifications for owned name expiry',
    'notificationEnabled',
    'notification',
  ],
  ['Edit favorite expiration reminders', 'notificationEnabled', 'notification'],
  ['Register coral.eth or opal.eth for 56 days', 'name', 'register'],
  ['Update a profile', 'name', 'edit_profile'],
]
const clarification = clarificationRows.map(
  ([query, field, family], index): AiEvalCase => ({
    id: `fresh-clarification-${index + 1}`,
    entryPoint: 'ai',
    category: 'clarification',
    language: 'paraphrase',
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family,
    query,
    expected: { status: 'needs_input', field },
    smoke: index < 3,
  }),
)

const unsupportedRows = [
  'Do not renew orbit.eth for 11 days',
  'Never set mint-tea.eth as primary',
  'Do not change nebula.eth GitHub to nebula-dev',
  'Register copper.eth for zero days',
  'Register lantern.eth for 14 days',
  'Renew meadow.eth for -2 years',
  'Extend comet.eth for 0 days',
  'Renew aurora.eth for 2.5 days',
  'Register cloud-nine.eth for half a year',
  'Renew fern.eth for two months',
  'Register coral.eth next Friday',
  'Renew harbor.eth until Christmas',
  'Register velvet.eth for 40 days and 3 years',
  'Renew sakura.eth for either 10 days or 20 days',
  'Turn owned expiry reminders both on and off',
  'Remind me every Tuesday about orbit.eth expiring',
  'Send expiry alerts exactly 9 hours before the deadline',
  'Write a poem about nebula.eth and set it as the description',
  'Find names with ocean vibes',
  'Show names containing the word tea',
  'Show names worth more than 4 ETH',
  'Renew all names expiring soon and email the receipt to my accountant',
  'Register lantern.eth for 30 days and publish a tweet about it',
  'Make meadow.eth primary and sell it on an external marketplace',
  'Set comet.eth Ethereum address to the wallet of my best friend',
  'Set aurora.eth avatar to javascript:alert(1)',
  'Set cloud-nine.eth email to not-an-email',
  'Set fern.eth Ethereum address to 0x123',
  'Set coral.eth GitHub to one-user and also to different-user',
  'Renew harbor.eth for 365 days then make it primary then favorite it',
]
const unsupported = unsupportedRows.map(
  (query, index): AiEvalCase => ({
    id: `fresh-unsupported-${index + 1}`,
    entryPoint: 'ai',
    category: 'unsupported',
    language: 'canonical',
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family: 'safety',
    query,
    expected: { status: 'unsupported' },
    smoke: index < 3,
  }),
)

const dashboardRows: readonly (readonly [
  string,
  Record<string, unknown> | null,
  AiEvalCase['language']?,
])[] = [
  [
    'owner names expiring within 13 days',
    { role: 'owner', expiry: 'expiring', withinDays: 13 },
  ],
  [
    'V2 favorites that are still active',
    { version: 'v2', favorite: 'yes', expiry: 'active' },
  ],
  ['grace period names I manage', { role: 'manager', expiry: 'in-grace' }],
  [
    'nmaes expiring wihtin 62 days',
    { expiry: 'expiring', withinDays: 62 },
    'typo',
  ],
  [
    'names whose grace period has finished',
    { expiry: 'past-grace' },
    'paraphrase',
  ],
  ['non-expiring favorites', { expiry: 'non-expiring', favorite: 'yes' }],
  [
    'V1 names not eligible for upgrade',
    { version: 'v1', upgrade: 'ineligible' },
  ],
  ['owned names except primary names', { role: 'owner', primary: 'no' }],
  [
    'V2 names sorted from Z to A',
    { version: 'v2', sort: 'name-desc' },
    'paraphrase',
  ],
  [
    'favrite names with earliest expriy first',
    { favorite: 'yes', sort: 'expiry-asc' },
    'typo',
  ],
  [
    'manager names, oldest registration first',
    { role: 'manager', sort: 'created-asc' },
  ],
  ['non-favorite names expiring soon', { favorite: 'no', expiry: 'expiring' }],
  ['primary names on ENSv2', { primary: 'yes', version: 'v2' }],
  [
    'eligible V1 names ordered alphabetically',
    { upgrade: 'eligible', version: 'v1', sort: 'name-asc' },
  ],
  [
    'active names I own, newest first',
    { expiry: 'active', role: 'owner', sort: 'created-desc' },
  ],
  [
    'favorite manager names expiring within 365 days',
    { favorite: 'yes', role: 'manager', expiry: 'expiring', withinDays: 365 },
  ],
  [
    'V1 names in grace except favorites',
    { version: 'v1', expiry: 'in-grace', favorite: 'no' },
  ],
  [
    'names that do not expire and are not my primary',
    { expiry: 'non-expiring', primary: 'no' },
    'paraphrase',
  ],
  [
    'v2 owned namse past graec',
    { version: 'v2', role: 'owner', expiry: 'past-grace' },
    'typo',
  ],
  [
    'names that need renewal within 5 days',
    { expiry: 'expiring', withinDays: 5 },
    'paraphrase',
  ],
  ['non-favorite primary names', { favorite: 'no', primary: 'yes' }],
  [
    'names I manage, latest expiry first',
    { role: 'manager', sort: 'expiry-desc' },
  ],
  ['eligible names that I own', { upgrade: 'eligible', role: 'owner' }],
  [
    'V1 favorites expiring within 29 days, earliest first',
    {
      version: 'v1',
      favorite: 'yes',
      expiry: 'expiring',
      withinDays: 29,
      sort: 'expiry-asc',
    },
  ],
  ['names expiring soon that sound like a coffee brand', null],
  ['names containing mint that I own', null],
  ['names expiring within -4 days', null],
  ['names expiring within 1.25 days', null],
  ['names that are both ENSv1 and ENSv2', null],
  ['names with a price under 200 dollars', null],
]
const dashboard = dashboardRows.map(
  ([query, filters, language = 'canonical'], index): AiEvalCase => ({
    id: `fresh-dashboard-${index + 1}`,
    entryPoint: 'dashboard',
    category: filters ? 'supported' : 'unsupported',
    language,
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family: 'dashboard',
    query,
    expected: filters
      ? { status: 'ready', action: { filters } }
      : { status: 'unsupported' },
    smoke: index < 4,
  }),
)

export const FRESH_AI_EVAL_CORPUS: readonly AiEvalCase[] = [
  ...supported,
  ...clarification,
  ...unsupported,
  ...dashboard,
]
