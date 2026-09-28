import type { SupportedLocale } from '@/lib/locales.config'
import { readDetailChoice } from './actionDetails'
import { isExplicitlyExcludedAiTarget } from './actionSafety'
import {
  hasCompleteNotificationRequest,
  inspectNotificationRequest,
  readNotificationFacet,
  readNotificationUnread,
} from './notificationRequest'
import {
  buildProfileAddressCopyQuestion,
  hasCompleteProfileAddressCopyRequest,
  hasExplicitAddressCopyOperation,
  parseProfileAddressCopyTarget,
} from './profileAddressCopy'
import {
  hasCompletePrimaryProfileRequest,
  hasCompleteProfileOwnerCopyRequest,
  hasCompleteProfileOwnerViewRequest,
} from './profileNativeRead'

export const managerActionCatalog = {
  unfavorite:
    'Remove one exact ENS name from favourites, unstar or unbookmark it.',
  share_profile:
    'Share an ENS profile by opening its existing share dialog and QR code. Recognize ordinary share/shrae/shar shorthand and typos; sharing is different from merely viewing a name.',
  copy_profile:
    'Copy the public link for one ENS profile using its share dialog.',
  copy_profile_address:
    'Copy one current cryptocurrency/network address FROM an ENS profile to the clipboard after review. The exact ENS name and network are required before the data review, not before interpreting the request. Preserve the requested network; ask if the name or network is missing. An explicitly requested main/default receiving address uses that profile value. Never substitute the connected wallet. Copying into another profile/network record is a profile edit, not this read-only clipboard action.',
  copy_profile_owner:
    'Copy the actual current owner address of one ENS name to the clipboard after review. Ask for the ENS name when missing. This is the owner shown in native profile details, not a cryptocurrency receiving address, manager, registrant, previous owner, or the connected wallet.',
  view_profile_owner:
    'Answer who currently owns one ENS name by reading its actual owner address in native profile details. Ask for the name when missing. This only shows the current owner; it does not copy, change ownership, resolve a receiving address, or show a previous owner.',
  view_primary_profile:
    'Open my currently connected wallet primary-name profile. Manager resolves the current verified primary name and explains if none exists. This only reads my existing primary name; it does not set/change it, choose a different owned name, or look up another account.',
  view_address:
    'Open the ENS profile and names for an exact Ethereum wallet address, or my connected wallet.',
  show_dashboard:
    'Open my dashboard or My Names tab without additional filters.',
  show_favorites:
    'Open the dashboard Favourites tab without additional filters.',
  show_notifications:
    'Open the notification inbox, optionally unread only or one existing category.',
  open_notification_settings:
    'Open notification settings or contact-method settings without changing a switch or contact method.',
  mark_notifications_read:
    'Mark currently loaded unread inbox notifications as read after review, optionally restricted to one existing inbox category. Historical unloaded notifications are not included.',
  email_add:
    'Add an email contact method for notifications and review sending verification.',
  email_remove:
    'Remove the existing email notification contact method after confirmation.',
  email_resend:
    'Resend verification for the existing pending email notification contact method.',
  telegram_connect:
    'Connect Telegram for notifications using the existing authentication popup.',
  telegram_remove:
    'Remove the existing Telegram notification contact method after confirmation.',
  push_enable: 'Enable browser push notifications for this browser.',
  push_disable: 'Disable browser push notifications for this browser.',
  migration_permissions:
    'Review current migration operator approvals / upgrade permissions.',
  migration_revoke:
    'Review removing one existing upgrade/migration permission: temporary smart-account access to the ENSv2 ETH registry, unwrapped ENSv1 .eth base-registrar access, or wrapped ENSv1 name-wrapper access. These exact revocations are supported; the wallet confirms the transaction.',
  nft_claim:
    'Review claiming, minting, or recovering my ENS migration commemorative NFT.',
  nft_view: 'View my already minted migration commemorative NFT.',
  nft_share: 'Open sharing controls for my minted migration commemorative NFT.',
  nft_download:
    'Download or save my minted migration commemorative NFT artwork/image, including an explicit WebP/webp request. Recognize download/downlaod typos. WebP in any letter case is supported. When no format is requested, the existing download defaults to WebP; users do not need to mention a format.',
  wallet_copy: 'Copy my currently connected wallet address.',
  wallet_disconnect: 'Disconnect my connected wallet after review.',
  language: 'Change the Manager interface language to English or Swedish.',
} as const

export type ManagerActionKind = keyof typeof managerActionCatalog
export const migrationApprovalKinds = [
  'eth-registry:hca',
  'base-registrar:hca',
  'name-wrapper:hca',
] as const
export type MigrationApprovalKind = (typeof migrationApprovalKinds)[number]
export const notificationTags = [
  'all',
  'expiry',
  'updates',
  'education',
  'onboarding',
  'transfer',
] as const
export type NotificationTag = (typeof notificationTags)[number]

export type ManagerAction = {
  readonly intent: 'manager_action'
  readonly kind: ManagerActionKind
  readonly name?: string
  readonly address?: string
  readonly ownWallet?: boolean
  readonly email?: string
  readonly approval?: MigrationApprovalKind
  readonly locale?: SupportedLocale
  readonly unreadOnly?: boolean
  readonly notificationTag?: NotificationTag
  readonly notificationTagRequested?: true
  readonly shareTarget?: 'x' | 'telegram' | 'link'
  readonly nameCandidates?: readonly string[]
  readonly addressCoinType?: number
  readonly mainReceivingAddress?: true
}

export type PreparedManagerAction = ManagerAction
export type ManagerActionInputs = {
  readonly name?: string
  readonly address?: string
  readonly managerValue?: string
}
export type ManagerActionPreparation =
  | { readonly status: 'ready'; readonly action: PreparedManagerAction }
  | {
      readonly status: 'needs_input'
      readonly field: 'name' | 'address' | 'managerValue'
      readonly message: string
      readonly label?: string
      readonly placeholder?: string
      readonly options?: readonly {
        readonly value: string
        readonly label: string
      }[]
    }
  | { readonly status: 'invalid'; readonly message: string }

export const buildManagerActionQuestions = (query: string) => ({
  manager_address_network: buildProfileAddressCopyQuestion(query),
  manager_share_target: {
    type: 'choice',
    instructions:
      'For any sharing or profile-link copying request, identify the explicit destination or recipient. Profile sharing supports only opening its native share/QR dialog or copying its link; it cannot preselect a platform, recipient, or delivery channel. NFT sharing has specific X, Telegram, and copy-link controls. A request to send/share with a person or by email is unsupported, even when the exact ENS name is known. Do not choose a default target. Ordinary share/show QR without a platform or recipient is missing.',
    criteria: {
      x: 'Share the NFT on X / Twitter.',
      telegram: 'Share the NFT on Telegram.',
      link: 'Copy the NFT or ENS profile link, including copying to the clipboard.',
      missing:
        'No platform/recipient requested; generic profile sharing, QR code, or generic NFT sharing.',
      unsupported:
        'Any recipient or delivery channel (including my boss/by email), a specific platform for profile sharing, another NFT platform, direct message, or automatic posting.',
    },
  },
  manager_wallet_target: {
    type: 'choice',
    instructions:
      'For a wallet profile request without an exact address, did the user explicitly ask for their own currently connected wallet? A generic wallet/address profile request needs an address; never assume it belongs to the connected account.',
    criteria: {
      own: 'Explicitly my wallet, my account, or the currently connected wallet.',
      missing:
        'Wallet identity is missing, ambiguous, or belongs to another person.',
      specified: 'An exact Ethereum address appears in the prompt.',
    },
  },
  manager_constraints: {
    type: 'choice',
    instructions: `Decide whether the FIRST requested management operation fits an existing Manager control. The complete supported list is: ${Object.values(managerActionCatalog).join(' ')} Opening the dashboard, My Names, Favourites, inbox, or permission page is supported and needs no value. Connecting/disconnecting Telegram, enabling/disabling browser notifications, adding/removing/resending notification email, copying/disconnecting the wallet, and changing app language ARE supported account operations. Profile sharing/unfavouriting accepts one exact ENS name. Alternatives such as share [ENS_NAME] OR [ENS_NAME_2] or unfavourite either name ARE supported: Manager asks which one and performs only that choice. An ambiguous alternative is not a demand to change all targets. Wallet view accepts one exact Ethereum address or explicitly my connected wallet; email accepts one address; revocation accepts one of the three existing migration approvals or asks which one; language supports English and Swedish/Svenska or asks which language; inbox accepts one category (expiry, updates, education, onboarding, transfer, or all) plus optional unread-only. The own-account commemorative NFT can be claimed, viewed, shared on X/Telegram or by link, or downloaded. A plain download/save artwork request IS supported and uses the existing WebP download by default; an explicit WebP/webp/WEBP image request is equally supported. Reject only an explicitly different format, never WebP itself. Missing required names, address networks, email, wallet address, permission, or language can be clarified, so missing information is supported. Eligibility, ownership, existing subscriptions, wallet login, browser permissions and feature availability are checked later by Manager, not reasons to reject. Reject only an EXPLICIT additional unsupported constraint, such as notification text/date search, a custom reminder schedule, arbitrary recipients or automatic posting, an explicitly unsupported file format, another account's NFT, demanding edits to all targets in one action, or a value that would be ignored. Understand shorthand and typos.`,
    criteria: {
      represented:
        'The first operation uses the supported existing Manager controls; its exact inputs fit, or missing inputs can be clarified.',
      unsupported:
        'An explicit extra requirement falls outside the listed controls and cannot be represented.',
    },
  },
  manager_action: {
    type: 'choice',
    instructions:
      'For a supported account, notifications, sharing, or migration-tools action, choose the exact FIRST operation. Understand ordinary phrasing and typos. Do not confuse notification email with an ENS profile email record, disconnecting a wallet with removing a channel, or removing migration approvals with upgrading names. Only the listed Manager controls exist.',
    criteria: { ...managerActionCatalog, none: 'No listed management action.' },
  },
  manager_approval: {
    type: 'choice',
    instructions:
      'If removing migration approval, select ONLY the explicitly identified permission. Temporary smart-account ENSv2 registry access is eth-registry:hca. Wrapped and unwrapped permissions are distinct persistent approvals. A vague request to remove migration access needs clarification, never choose a default.',
    criteria: {
      'eth-registry:hca':
        'Temporary smart account / ENSv2 ETH registry access.',
      'base-registrar:hca':
        'Unwrapped ENSv1 .eth name / base registrar access.',
      'name-wrapper:hca': 'Wrapped ENSv1 name / name wrapper access.',
      missing:
        'Permission not identified or more than one permission requested.',
    },
  },
  manager_locale: {
    type: 'choice',
    instructions:
      'Select an explicitly requested Manager interface language. Never translate another language into a supported default.',
    criteria: {
      en: 'English.',
      sv: 'Swedish / Svenska.',
      missing: 'No language supplied.',
      unsupported: 'Any other language or ambiguous alternatives.',
    },
  },
  manager_notification_scope: {
    type: 'choice',
    instructions:
      'For viewing the inbox or marking notifications as read, choose the requested category. Only unread status plus one listed category can be combined. Mark only expiry notifications as read uses expiry. No category supplied uses all. Free-text/name search, arbitrary periods, and OR categories are unsupported.',
    criteria: {
      all: 'All categories or no category supplied.',
      missing:
        'The user wants one category/type of notifications but has not identified which category.',
      expiry: 'Expiry alerts.',
      updates: 'ENS updates.',
      education: 'Education.',
      onboarding: 'Onboarding.',
      transfer: 'Transfers.',
      unsupported: 'Any other filtering or more than one category.',
    },
  },
  manager_unread: {
    type: 'choice',
    instructions:
      'For an inbox request, did the user restrict the selection to unread notifications? Mark as read describes the requested operation, not a restriction to already-read notifications; choose no unless the selected items are explicitly unread. An explicit request to select only already-read items is unsupported.',
    criteria: {
      yes: 'Unread only.',
      no: 'All/read status not restricted.',
      unsupported: 'Read-only or another unsupported status filter.',
    },
  },
})

const getTargetName = (
  answers: Record<string, unknown>,
  names: readonly string[],
) => {
  if (names.length <= 1) return names[0]
  const selected = readDetailChoice(
    answers,
    'target_name',
    names.map((_, index) => `name_${index + 1}`),
  )
  return selected ? names[Number(selected.slice(5)) - 1] : undefined
}

const nameActionKinds: readonly ManagerActionKind[] = [
  'unfavorite',
  'share_profile',
  'copy_profile',
  'copy_profile_address',
  'copy_profile_owner',
  'view_profile_owner',
]
const emailActionKinds: readonly ManagerActionKind[] = [
  'email_add',
  'email_remove',
  'email_resend',
]

const hasManagerOperationConflict = (
  query: string,
  kind: ManagerActionKind,
): boolean => {
  const disable =
    /\b(?:disable|turn\s+off|remove|delete|disconnect|unsubscribe|stop)\b/i.test(
      query,
    )
  const enable = /\b(?:enable|turn\s+on|add|connect|subscribe)\b/i.test(query)
  if (
    disable &&
    ['push_enable', 'telegram_connect', 'email_add'].includes(kind)
  )
    return true
  if (
    enable &&
    ['push_disable', 'telegram_remove', 'email_remove'].includes(kind)
  )
    return true
  if (
    kind === 'nft_download' &&
    /\b(?:png|jpe?g|gif|svg|mp4|pdf)\b/i.test(query)
  )
    return true
  if (kind === 'migration_revoke' && /\b(?:all|every)\b/i.test(query))
    return true
  return kind === 'unfavorite' && /\b(?:all|every)\b/i.test(query)
}

const hasUnsupportedProfileShareTarget = (
  kind: ManagerActionKind,
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  if (kind !== 'share_profile' && kind !== 'copy_profile') return false
  const instructions = query.replace(/\S*[.@]\S*/g, '')
  if (
    /\b(?:on|via|by|through|using)\s+(?:e-?mail|telegram|x|twitter|discord|slack|whatsapp|facebook|instagram|farcaster|message|dm)\b/i.test(
      instructions,
    ) ||
    /\b(?:with|to)\s+(?!(?:(?:my|the|a|an)\s+)?(?:clipboard|qr\b|link\b|share\b))(?:(?:my|our|the|a|an)\s+|@)/i.test(
      instructions,
    )
  )
    return true
  const target = readDetailChoice(answers, 'manager_share_target', [
    'x',
    'telegram',
    'link',
    'missing',
    'unsupported',
  ])
  if (kind === 'copy_profile' && isLiteralClipboardCopy(instructions)) {
    const raw = readChoiceEvidence(answers.manager_share_target)
    return raw !== 'link' && raw !== 'missing'
  }
  return target !== 'missing' && target !== 'link'
}

const isLiteralClipboardCopy = (instruction: string): boolean =>
  /\bclipboard\b/i.test(instruction) &&
  /\b(?:copy|put)\b/i.test(instruction) &&
  !instruction
    .replace(
      /\b(?:copy|put|the|a|my|to|of|for|on|in|link|profile|clipboard|please|url)\b/gi,
      '',
    )
    .replace(/[\s.!?,;:'"“”‘’]/g, '')

const parseShareTarget = (
  answers: Record<string, unknown>,
): ManagerAction | null => {
  const target = readDetailChoice(answers, 'manager_share_target', [
    'x',
    'telegram',
    'link',
    'missing',
    'unsupported',
  ])
  return !target || target === 'unsupported'
    ? null
    : {
        intent: 'manager_action',
        kind: 'nft_share',
        ...(target !== 'missing' && { shareTarget: target }),
      }
}

const exactApprovalPatterns: readonly [MigrationApprovalKind, RegExp][] = [
  ['eth-registry:hca', /\b(?:eth|ensv?2)\s+registry\b/i],
  ['base-registrar:hca', /\bbase[ -]registrar\b|\bunwrapped\b/i],
  ['name-wrapper:hca', /\bname[ -]wrapper\b|\bwrapped\b/i],
]

const readChoiceEvidence = (raw: unknown): string | null => {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('type' in raw) ||
    raw.type !== 'choice' ||
    !('choice' in raw) ||
    typeof raw.choice !== 'string' ||
    !('confidence' in raw) ||
    typeof raw.confidence !== 'number' ||
    !Number.isFinite(raw.confidence) ||
    raw.confidence < 0 ||
    raw.confidence > 1
  )
    return null
  return raw.choice
}

const parseApproval = (
  query: string,
  answers: Record<string, unknown>,
): MigrationApprovalKind | 'missing' | null => {
  const instruction = query.replace(/\S*[.@]\S*/g, '')
  const literal = exactApprovalPatterns.filter(([, pattern]) =>
    pattern.test(instruction),
  )
  if (literal.length > 1) return null
  const interpreted = readDetailChoice(answers, 'manager_approval', [
    ...migrationApprovalKinds,
    'missing',
  ])
  const exact = literal[0]?.[0]
  if (!exact) return interpreted
  const raw = readChoiceEvidence(answers.manager_approval)
  // The exact local qualifier can resolve uncertain matching evidence, but a
  // contradictory model choice must not select a different permission.
  return raw === exact || raw === 'missing' ? exact : null
}

/** Resolve a model routing disagreement only for an explicit operation + resource. */
export const hasExplicitManagerOperation = (
  query: string,
  kind: ManagerActionKind,
): boolean => {
  if (kind === 'view_primary_profile')
    return hasCompletePrimaryProfileRequest(query)
  if (kind === 'copy_profile_owner')
    return hasCompleteProfileOwnerCopyRequest(query)
  if (kind === 'view_profile_owner')
    return hasCompleteProfileOwnerViewRequest(query)
  if (kind === 'copy_profile_address')
    return hasExplicitAddressCopyOperation(query)
  if (kind === 'open_notification_settings')
    return (
      /\b(?:open|show|view|go|take|settings)\b/i.test(query) &&
      /\b(?:notification|contact[ -]method)s?\s+(?:settings|preferences)\b/i.test(
        query,
      )
    )
  if (kind === 'show_notifications' || kind === 'mark_notifications_read') {
    const request = inspectNotificationRequest(query)
    return request?.complete === true && request.operation === kind
  }
  const instruction = query.replace(/\S*[.@]\S*/g, '')
  if (kind === 'migration_revoke')
    return (
      /\b(?:revoke|revkoe|revok|remove|disable|cancel)\b/i.test(instruction) &&
      /\b(?:permissions?|approvals?|access)\b/i.test(instruction) &&
      /\b(?:migration|migrtion|upgrade|registry|wrapper|registrar)\b/i.test(
        instruction,
      )
    )
  if (!/\b(?:nft|commemorative)\b/i.test(instruction)) return false
  switch (kind) {
    case 'nft_download':
      return /\b(?:download|downlaod|dowload|dwonload|save)\b/i.test(
        instruction,
      )
    case 'nft_view':
      return /\b(?:show|view|see|open)\b/i.test(instruction)
    case 'nft_share':
      return /\b(?:share|shrae|shar|copy)\b/i.test(instruction)
    case 'nft_claim':
      return /\b(?:claim|cliam|mint|recover)\b/i.test(instruction)
    default:
      return false
  }
}

const parseNotificationAction = (
  kind: 'show_notifications' | 'mark_notifications_read',
  answers: Record<string, unknown>,
  query: string,
): ManagerAction | null => {
  const request = inspectNotificationRequest(query)
  if (!request || (request.operation && request.operation !== kind)) return null
  const notificationTag = readNotificationFacet(
    answers,
    'manager_notification_scope',
    [...notificationTags, 'missing'],
    request.tag,
    request.complete,
  )
  const unread = readNotificationUnread(kind, answers, request)
  return !notificationTag || !unread
    ? null
    : {
        intent: 'manager_action',
        kind,
        ...(notificationTag === 'missing'
          ? { notificationTagRequested: true as const }
          : { notificationTag }),
        unreadOnly: unread === 'yes',
      }
}

const parseManagerFacet = (
  kind: ManagerActionKind,
  answers: Record<string, unknown>,
  query: string,
): ManagerAction | null | undefined => {
  if (kind === 'nft_share') return parseShareTarget(answers)
  if (kind === 'language') {
    const locale = readDetailChoice(answers, 'manager_locale', [
      'en',
      'sv',
      'missing',
      'unsupported',
    ])
    return !locale || locale === 'unsupported'
      ? null
      : {
          intent: 'manager_action',
          kind,
          ...(locale !== 'missing' && { locale }),
        }
  }
  if (kind === 'migration_revoke') {
    const approval = parseApproval(query, answers)
    return approval
      ? {
          intent: 'manager_action',
          kind,
          ...(approval !== 'missing' && { approval }),
        }
      : null
  }
  if (kind === 'show_notifications' || kind === 'mark_notifications_read') {
    return parseNotificationAction(kind, answers, query)
  }
  return undefined
}

const isExplicitOwnWallet = (
  query: string,
  answers: Record<string, unknown>,
): boolean =>
  /\b(?:my|mine|connected|current)\b/i.test(query) &&
  readDetailChoice(answers, 'manager_wallet_target', [
    'own',
    'missing',
    'specified',
  ]) === 'own'

const hasUnrepresentedExactValue = (
  kind: ManagerActionKind,
  names: readonly string[],
  emails: readonly string[],
  addresses: readonly string[],
): boolean =>
  emails.length > 1 ||
  addresses.length > 1 ||
  (names.length > 0 && !nameActionKinds.includes(kind)) ||
  (emails.length > 0 && !emailActionKinds.includes(kind)) ||
  (addresses.length > 0 && kind !== 'view_address')

const parseManagerValues = (
  kind: ManagerActionKind,
  query: string,
  answers: Record<string, unknown>,
  names: readonly string[],
): Partial<ManagerAction> | null => {
  const hasAlternatives =
    names.length > 1 && /\bor\b/i.test(query.replace(/\S*[.@]\S*/g, ''))
  const name = hasAlternatives ? undefined : getTargetName(answers, names)
  if (name && isExplicitlyExcludedAiTarget(query, name)) return null
  const emails = [...new Set(query.match(/[^\s,;<>]+@[^\s,;<>]+/g) ?? [])]
  const addresses = [...new Set(query.match(/\b0x[\da-z]+\b/gi) ?? [])]
  // Exact values are copied from the user, never generated by the model.
  if (hasUnrepresentedExactValue(kind, names, emails, addresses)) return null
  if (kind === 'view_address')
    return {
      address: addresses[0],
      ownWallet: isExplicitOwnWallet(query, answers),
    }
  if (emailActionKinds.includes(kind))
    return { email: emails[0]?.replace(/[.!?]$/, '') }
  if (nameActionKinds.includes(kind))
    return { name, ...(names.length > 1 && !name && { nameCandidates: names }) }
  return {}
}

const hasUnsupportedNativeProfileRead = (
  query: string,
  kind: ManagerActionKind,
): boolean => {
  if (kind === 'view_primary_profile')
    return !hasCompletePrimaryProfileRequest(query)
  if (kind === 'copy_profile_owner')
    return !hasCompleteProfileOwnerCopyRequest(query)
  if (kind === 'view_profile_owner')
    return !hasCompleteProfileOwnerViewRequest(query)
  return false
}

export const parseManagerAction = (
  query: string,
  answers: Record<string, unknown>,
  names: readonly string[],
): ManagerAction | null => {
  const kind = readDetailChoice(
    answers,
    'manager_action',
    Object.keys(managerActionCatalog) as ManagerActionKind[],
  )
  if (
    !kind ||
    (readDetailChoice(answers, 'manager_constraints', [
      'represented',
      'unsupported',
    ]) !== 'represented' &&
      !(
        (kind === 'show_notifications' || kind === 'mark_notifications_read') &&
        hasCompleteNotificationRequest(query, answers)
      ) &&
      !(
        kind === 'copy_profile_address' &&
        hasCompleteProfileAddressCopyRequest(query, answers)
      ))
  )
    return null
  // Words within exact names/emails are values, not instructions.
  if (hasManagerOperationConflict(query.replace(/\S*[.@]\S*/g, ''), kind))
    return null
  if (hasUnsupportedProfileShareTarget(kind, query, answers)) return null
  const values = parseManagerValues(kind, query, answers, names)
  if (!values) return null
  if (hasUnsupportedNativeProfileRead(query, kind)) return null
  if (kind === 'copy_profile_address') {
    const target = parseProfileAddressCopyTarget(query, answers)
    return target
      ? { intent: 'manager_action', kind, ...values, ...target }
      : null
  }
  const facet = parseManagerFacet(kind, answers, query)
  if (facet !== undefined) return facet
  return {
    intent: 'manager_action',
    kind,
    ...values,
  }
}

export const getManagerActionTitle = (action: ManagerAction): string =>
  ({
    unfavorite: `Remove ${action.name ?? 'a name'} from favourites`,
    share_profile: `Share ${action.name ?? 'an ENS profile'}`,
    copy_profile: `Copy the link for ${action.name ?? 'an ENS profile'}`,
    copy_profile_address: `Copy an address from ${action.name ?? 'an ENS profile'}`,
    copy_profile_owner: `Copy the owner address of ${action.name ?? 'an ENS name'}`,
    view_profile_owner: `Who owns ${action.name ?? 'this ENS name'}?`,
    view_primary_profile: 'Open my primary-name profile',
    view_address: 'View wallet profile',
    show_dashboard: 'Open My Names',
    show_favorites: 'Open Favourites',
    show_notifications: 'Open notifications',
    open_notification_settings: 'Open notification settings',
    mark_notifications_read: 'Review marking loaded notifications as read',
    email_add: 'Add notification email',
    email_remove: 'Remove notification email',
    email_resend: 'Resend email verification',
    telegram_connect: 'Connect Telegram notifications',
    telegram_remove: 'Remove Telegram notifications',
    push_enable: 'Enable browser notifications',
    push_disable: 'Disable browser notifications',
    migration_permissions: 'Review migration permissions',
    migration_revoke: 'Review removing migration permission',
    nft_claim: 'Review commemorative NFT claim',
    nft_view: 'View commemorative NFT',
    nft_share: 'Share commemorative NFT',
    nft_download: 'Download commemorative artwork',
    wallet_copy: 'Copy wallet address',
    wallet_disconnect: 'Disconnect wallet',
    language: 'Change interface language',
  })[action.kind]

export { prepareManagerAction } from './prepareManagerAction'
