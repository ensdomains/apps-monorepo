import type { ManagerActionKind } from '@/features/ai/managerActions'
import type { AiEvalCase } from './corpus'

// Independent labels for newly exposed native Manager controls. Do not merge
// these into either frozen corpus or relabel failures after observing Jev.
type ManagerRow = readonly [query: string, details?: Record<string, unknown>]
const managerGroups: Readonly<
  Record<
    Exclude<
      ManagerActionKind,
      | 'copy_profile_address'
      | 'open_notification_settings'
      | 'copy_profile_owner'
      | 'view_profile_owner'
      | 'view_primary_profile'
    >,
    readonly ManagerRow[]
  >
> = {
  unfavorite: [
    ['Remove orbit.eth from my favorites', { name: 'orbit.eth' }],
    ['Unstar mint-tea.eth please', { name: 'mint-tea.eth' }],
    ['unfavrite nebula.eth', { name: 'nebula.eth' }],
  ],
  share_profile: [
    ['Share the profile for copper.eth', { name: 'copper.eth' }],
    ['Show me the QR code for lantern.eth', { name: 'lantern.eth' }],
    ['shrae meadow.eth profile', { name: 'meadow.eth' }],
  ],
  copy_profile: [
    ['Copy the profile link for comet.eth', { name: 'comet.eth' }],
    ['Put the link to café.eth profile on my clipboard', { name: 'café.eth' }],
    ['cpoy aurora.eth profile URL', { name: 'aurora.eth' }],
  ],
  view_address: [
    [
      'Show the wallet profile for 0x1111111111111111111111111111111111111111',
      {
        address: '0x1111111111111111111111111111111111111111',
        ownWallet: false,
      },
    ],
    ['Open the profile for my connected wallet', { ownWallet: true }],
    [
      'shwo names for wallet 0x2222222222222222222222222222222222222222',
      {
        address: '0x2222222222222222222222222222222222222222',
        ownWallet: false,
      },
    ],
  ],
  show_dashboard: [
    ['Open My Names'],
    ['Take me to my dashboard'],
    ['opne my dashbaord'],
  ],
  show_favorites: [
    ['Open the favorites tab'],
    ['Take me to my bookmarked names'],
    ['opne favrites tab'],
  ],
  show_notifications: [
    [
      'Open my notification inbox',
      { notificationTag: 'all', unreadOnly: false },
    ],
    [
      'Show unread expiry notifications',
      { notificationTag: 'expiry', unreadOnly: true },
    ],
    [
      'shwo unread tranfer notifications',
      { notificationTag: 'transfer', unreadOnly: true },
    ],
  ],
  mark_notifications_read: [
    [
      'Mark currently loaded unread notifications as read',
      // Explicit scope fields preserve the original all/unread-only request.
      { notificationTag: 'all', unreadOnly: true },
    ],
    [
      'Clear the unread status of the notifications loaded in my inbox',
      // The review now preserves its existing all/unread scope explicitly.
      // This maintains the original semantic label after that contract change.
      { notificationTag: 'all', unreadOnly: true },
    ],
    [
      'mark loaded notifcations as raed',
      // This request includes the loaded inbox without an unread-only filter.
      { notificationTag: 'all', unreadOnly: false },
    ],
  ],
  email_add: [
    [
      'Use alerts@example.org for notification emails',
      { email: 'alerts@example.org' },
    ],
    [
      'Add hello+ens@example.com as my notification email',
      { email: 'hello+ens@example.com' },
    ],
    [
      'add notifcation email copper@example.net',
      { email: 'copper@example.net' },
    ],
  ],
  email_remove: [
    ['Remove my notification email'],
    [
      'Disconnect alerts@example.org from notifications',
      { email: 'alerts@example.org' },
    ],
    ['remvoe email notifcation channel'],
  ],
  email_resend: [
    ['Resend my email verification'],
    [
      'Send the verification email again to alerts@example.org',
      { email: 'alerts@example.org' },
    ],
    ['resned pending email verifcation'],
  ],
  telegram_connect: [
    ['Connect Telegram for notifications'],
    ['I would like to receive alerts through Telegram'],
    ['conect telgram notifcations'],
  ],
  telegram_remove: [
    ['Disconnect Telegram notifications'],
    ['Remove my Telegram notification contact'],
    ['remvoe telgram alert channel'],
  ],
  push_enable: [
    ['Enable browser push notifications'],
    ['Let this browser notify me'],
    ['enabel push notifcations for this browser'],
  ],
  push_disable: [
    ['Disable browser push notifications'],
    ['Turn push alerts off in this browser'],
    ['disabel browesr notifications'],
  ],
  migration_permissions: [
    ['Show my migration permissions'],
    ['Review the operator approvals for upgrading my names'],
    ['view migrtion aprovals'],
  ],
  migration_revoke: [
    [
      'Revoke temporary smart account ENSv2 registry access',
      { approval: 'eth-registry:hca' },
    ],
    [
      'Remove the base registrar approval for my unwrapped V1 names',
      { approval: 'base-registrar:hca' },
    ],
    ['revkoe name wrapper migrtion approval', { approval: 'name-wrapper:hca' }],
  ],
  nft_claim: [
    ['Claim my migration commemorative NFT'],
    ['Recover the commemorative NFT from my ENS upgrade'],
    ['mint my commemrative nft'],
  ],
  nft_view: [
    ['View my minted commemorative NFT'],
    ['Show the NFT I received for my ENS migration'],
    ['shwo my migrtion nft'],
  ],
  nft_share: [
    ['Share my migration commemorative NFT'],
    ['Open the sharing options for my upgrade NFT'],
    ['shrae my commemrative NFT'],
  ],
  nft_download: [
    ['Download my migration NFT artwork'],
    ['Save the WebP image of my commemorative NFT'],
    ['downlaod my migrtion NFT as webp'],
  ],
  wallet_copy: [
    ['Copy my connected wallet address'],
    ['Put my wallet address on the clipboard'],
    ['cpoy my walet address'],
  ],
  wallet_disconnect: [
    ['Disconnect my wallet'],
    ['End the wallet connection to Manager'],
    ['disconect this walet'],
  ],
  language: [
    ['Change the Manager app language to Swedish', { locale: 'sv' }],
    ['Use English for the interface', { locale: 'en' }],
    ['set app langauge to svenska', { locale: 'sv' }],
  ],
}

const manager = Object.entries(managerGroups).flatMap(
  ([kind, rows], groupIndex) =>
    rows.map(
      ([query, details = {}], index): AiEvalCase => ({
        id: `expansion-${kind}-${index + 1}`,
        entryPoint: 'ai',
        category: 'supported',
        language:
          index === 2 ? 'typo' : index === 1 ? 'paraphrase' : 'canonical',
        split:
          (groupIndex * 3 + index + 1) % 5 === 0 ? 'heldout' : 'development',
        family: 'manager_action',
        query,
        expected: {
          status: 'ready',
          action: { intent: 'manager_action', kind, ...details },
        },
        smoke: index === 0,
      }),
    ),
)

type ProfileRow = readonly [
  query: string,
  section: string,
  proposal: Record<string, unknown>,
  language?: AiEvalCase['language'],
]
const profileRows: readonly ProfileRow[] = [
  [
    'Set orbit.eth banner to https://example.org/banner.webp',
    'general',
    { field: 'header', value: 'https://example.org/banner.webp' },
  ],
  [
    'Set orbit.eth full name to "River Stone"',
    'general',
    { field: 'display_name', value: 'River Stone' },
  ],
  [
    'Set orbit.eth website to https://example.org/studio',
    'general',
    { field: 'website', value: 'https://example.org/studio' },
  ],
  [
    'Change orbit.eth location to "Bengaluru, India"',
    'general',
    { field: 'location', value: 'Bengaluru, India' },
  ],
  [
    'Set orbit.eth timezone to UTC+5',
    'general',
    { field: 'timezone', value: 'UTC+5' },
  ],
  [
    'Set orbit.eth profile language to French',
    'general',
    { field: 'language', value: 'fr' },
  ],
  [
    'Set orbit.eth phone number to +12025550123',
    'contact',
    { field: 'phone', value: '+12025550123' },
  ],
  [
    'Set orbit.eth postal address to "12 Example Lane"',
    'contact',
    { field: 'postal_address', value: '12 Example Lane' },
  ],
  [
    'Set orbit.eth Twitter to orbitdev',
    'contact',
    { field: 'twitter', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Telegram username to orbitdev',
    'contact',
    { field: 'telegram', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Farcaster to orbitdev',
    'contact',
    { field: 'farcaster', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Discord to orbitdev',
    'contact',
    { field: 'discord', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Instagram to orbitdev',
    'contact',
    { field: 'instagram', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth LinkedIn to orbitdev',
    'contact',
    { field: 'linkedin', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Mastodon to https://mastodon.social/@orbitdev',
    'contact',
    { field: 'mastodon', value: 'https://mastodon.social/@orbitdev' },
  ],
  [
    'Set orbit.eth Reddit to orbitdev',
    'contact',
    { field: 'reddit', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth TikTok to orbitdev',
    'contact',
    { field: 'tiktok', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth Twitch to orbitdev',
    'contact',
    { field: 'twitch', value: 'orbitdev' },
  ],
  [
    'Set orbit.eth GitHub to new-orbit instead of old-orbit',
    'contact',
    { field: 'github', value: 'new-orbit', expectedValue: 'old-orbit' },
  ],
  [
    'Set orbit.eth email to orbit@example.org',
    'contact',
    { field: 'email', value: 'orbit@example.org' },
  ],
  [
    'Set orbit.eth theme to Garnet',
    'appearance',
    { field: 'theme', value: '#E72A96' },
  ],
  [
    'Set orbit.eth avatar to https://example.org/orbit.png',
    'general',
    { field: 'avatar', value: 'https://example.org/orbit.png' },
  ],
  [
    'Set orbit.eth description to "Making space for better software"',
    'general',
    { field: 'description', value: 'Making space for better software' },
  ],
  [
    'Set orbit.eth Bitcoin address to 1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    'addresses',
    {
      field: 'address',
      coinType: 0,
      value: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    },
  ],
  [
    'Set orbit.eth Solana address to 11111111111111111111111111111111',
    'addresses',
    {
      field: 'address',
      coinType: 501,
      value: '11111111111111111111111111111111',
    },
  ],
  [
    'Set orbit.eth Base address to 0x1111111111111111111111111111111111111111',
    'addresses',
    {
      field: 'address',
      // Manager's existing Base picker targets Sepolia (84532), not mainnet (8453).
      coinType: 2147568180,
      value: '0x1111111111111111111111111111111111111111',
    },
  ],
  [
    'Use my Ethereum address for the Base record on orbit.eth',
    'addresses',
    { field: 'address', coinType: 2147568180, operation: 'use_eth', value: '' },
    'paraphrase',
  ],
  [
    'Use the Ethereum address on orbit.eth for its Polygon address',
    'addresses',
    { field: 'address', coinType: 2147483785, operation: 'use_eth', value: '' },
    'paraphrase',
  ],
  [
    'Remove orbit.eth Bitcoin address',
    'addresses',
    { field: 'address', coinType: 0, operation: 'remove', value: '' },
  ],
  [
    'Delete the Solana record from orbit.eth',
    'addresses',
    { field: 'address', coinType: 501, operation: 'remove', value: '' },
    'paraphrase',
  ],
  [
    'Remove orbit.eth email record',
    'contact',
    { field: 'email', operation: 'remove', value: '' },
  ],
  [
    'Clear the description on orbit.eth',
    'general',
    { field: 'description', operation: 'remove', value: '' },
    'paraphrase',
  ],
  [
    'Remove orbit.eth banner image',
    'general',
    { field: 'header', operation: 'remove', value: '' },
  ],
  [
    'Delete orbit.eth phone number',
    'contact',
    { field: 'phone', operation: 'remove', value: '' },
  ],
  [
    'remvoe orbit.eth githb record',
    'contact',
    { field: 'github', operation: 'remove', value: '' },
    'typo',
  ],
  [
    'Feature GitHub on orbit.eth',
    'contact',
    { field: 'github', operation: 'feature', value: '' },
  ],
  [
    'Pin Twitter as a featured contact on orbit.eth',
    'contact',
    { field: 'twitter', operation: 'feature', value: '' },
    'paraphrase',
  ],
  [
    'Unfeature Telegram on orbit.eth',
    'contact',
    { field: 'telegram', operation: 'unfeature', value: '' },
  ],
  [
    'unpin orbit.eth farcastr contact',
    'contact',
    { field: 'farcaster', operation: 'unfeature', value: '' },
    'typo',
  ],
  [
    'Add a link named "Portfolio" to orbit.eth with URL https://example.org/work',
    'links',
    { field: 'link', value: 'https://example.org/work', linkName: 'Portfolio' },
  ],
  [
    'Remove the link named "Portfolio" from orbit.eth',
    'links',
    {
      field: 'link',
      operation: 'remove',
      value: '',
      linkName: 'Portfolio',
      linkTarget: 'Portfolio',
    },
  ],
  [
    'Rename orbit.eth link "Portfolio" to "Selected work"',
    'links',
    {
      field: 'link',
      operation: 'rename',
      value: '',
      linkName: 'Selected work',
      linkTarget: 'Portfolio',
    },
  ],
  [
    'Replace orbit.eth link "Portfolio" URL https://example.org/old with https://example.org/new',
    'links',
    {
      field: 'link',
      value: 'https://example.org/new',
      expectedValue: 'https://example.org/old',
      linkName: 'Portfolio',
      linkTarget: 'Portfolio',
    },
  ],
  [
    'Remove orbit.eth Ethereum address',
    'addresses',
    { field: 'eth_address', operation: 'remove', value: '' },
  ],
  [
    'Set orbit.eth Ethereum address to 0x2222222222222222222222222222222222222222',
    'addresses',
    {
      field: 'eth_address',
      value: '0x2222222222222222222222222222222222222222',
    },
  ],
  [
    'Set orbit.eth location to "Lisbon" instead of "Berlin"',
    'general',
    { field: 'location', value: 'Lisbon', expectedValue: 'Berlin' },
  ],
  [
    'set orbit.eth instgram to orbitphotos',
    'contact',
    { field: 'instagram', value: 'orbitphotos' },
    'typo',
  ],
  [
    'Change orbit.eth full name from "River Stone" to "River Sky"',
    'general',
    { field: 'display_name', value: 'River Sky', expectedValue: 'River Stone' },
    'paraphrase',
  ],
]
const profile = profileRows.map(
  ([query, section, proposal, language = 'canonical'], index): AiEvalCase => ({
    id: `expansion-profile-${index + 1}`,
    entryPoint: 'ai',
    category: 'supported',
    language,
    split: (manager.length + index + 1) % 5 === 0 ? 'heldout' : 'development',
    family: 'edit_profile',
    query,
    expected: {
      status: 'ready',
      action: { intent: 'edit_profile', name: 'orbit.eth', section, proposal },
    },
    smoke: [0, 23, 26, 30, 35, 39, 40, 41].includes(index),
  }),
)

const clarificationRows: readonly (readonly [
  string,
  string,
  'manager_action' | 'edit_profile',
])[] = [
  ['Remove a name from favorites', 'name', 'manager_action'],
  ['Share an ENS profile', 'name', 'manager_action'],
  ['Copy an ENS profile URL', 'name', 'manager_action'],
  ['Add an email notification contact', 'managerValue', 'manager_action'],
  ['Remove a migration approval', 'managerValue', 'manager_action'],
  ['Change the app language', 'managerValue', 'manager_action'],
  ['Unfavorite copper.eth or meadow.eth', 'name', 'manager_action'],
  ['Share copper.eth or meadow.eth', 'name', 'manager_action'],
  ['Set orbit.eth Bitcoin address', 'profileValue', 'edit_profile'],
  [
    "Set orbit.eth Bitcoin address to satoshi's address",
    'profileValue',
    'edit_profile',
  ],
  ['Set orbit.eth Solana address', 'profileValue', 'edit_profile'],
  [
    'Set orbit.eth network address to 0x1111111111111111111111111111111111111111',
    'profileNetwork',
    'edit_profile',
  ],
  ['Set orbit.eth banner image', 'profileValue', 'edit_profile'],
  ['Change orbit.eth timezone', 'profileValue', 'edit_profile'],
  ['Set orbit.eth full name', 'profileValue', 'edit_profile'],
  ['Remove a link from orbit.eth', 'profileLinkName', 'edit_profile'],
  ['Rename orbit.eth link "Portfolio"', 'profileLinkName', 'edit_profile'],
  ['Add a link called "Portfolio" to orbit.eth', 'url', 'edit_profile'],
  ['Set my Twitter handle to orbitdev', 'name', 'edit_profile'],
  ['Remove the Bitcoin address from my profile', 'name', 'edit_profile'],
]
const clarification = clarificationRows.map(
  ([query, field, family], index): AiEvalCase => ({
    id: `expansion-clarification-${index + 1}`,
    entryPoint: 'ai',
    category: 'clarification',
    language: 'canonical',
    split: (index + 1) % 5 === 0 ? 'heldout' : 'development',
    family,
    query,
    expected: { status: 'needs_input', field },
    smoke: index < 3,
  }),
)

const unsupportedRows = [
  'Do not remove orbit.eth from favorites',
  'Unfavorite every name in my account',
  'Share orbit.eth with my boss by email',
  'Copy the profile URL of orbit.eth and send it to my Telegram group',
  'Open the wallet profile for 0x123',
  'Add both first@example.org and second@example.org as notification emails',
  'Disable push notifications on all of my devices',
  'Show notifications from last Tuesday only',
  'Show notifications that are already read',
  'Show expiry or transfer notifications',
  'Mark all historical notifications, including unloaded ones, as read',
  'Remove every migration approval',
  'Download my commemorative NFT as SVG',
  'Change the Manager interface to Japanese',
  'Disconnect the wallet 0x1111111111111111111111111111111111111111',
  'Use my Ethereum address for orbit.eth Bitcoin record',
  'Feature orbit.eth postal address',
  'Set orbit.eth Solana address to 0x1111111111111111111111111111111111111111',
  'Set orbit.eth Twitter to orbitdev and delete the email record',
  'Remove orbit.eth email and automatically sign the transaction without confirmation',
]
const unsupported = unsupportedRows.map(
  (query, index): AiEvalCase => ({
    id: `expansion-unsupported-${index + 1}`,
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

export const EXPANSION_AI_EVAL_CORPUS: readonly AiEvalCase[] = [
  ...manager,
  ...profile,
  ...clarification,
  ...unsupported,
]
