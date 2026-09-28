import {
  ETH_COIN_TYPE,
  isEvmCoinType,
} from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
import { maxPrimaryContactMethods } from '@/features/profile/components/dialogs/edit-profile/tabs/contact/constants'
import { parsePrimaryContactKeys } from '@/features/profile/components/dialogs/edit-profile/tabs/contact/records'
import { PROFILE_THEMES } from '@/features/profile/constants'
import { createSocialProfileValueNormalizer } from '@/features/profile/data/records/social'
import type { ProfileRecords } from '@/features/profile/types'
import { resolveThemeColor } from '@/features/profile/utils/themeColor'
import { validateAddressRecordValue } from '@/features/profile/utils/validateAddress'
import type { ProfileEditProposal } from './profileEditProposal'
import {
  getProfileFieldDefinition,
  getProfileNetwork,
} from './profileFieldRegistry'

const normalizeGitHubProfileValue = createSocialProfileValueNormalizer({
  hosts: ['github.com'],
})
const gitHubUsernamePattern = /^[a-z\d]+(?:-[a-z\d]+)*$/i

/** A profile record stores a handle, never a repository path or arbitrary URL. */
export const normalizeGitHubUsername = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^(?:https?:\/\/|(?:www\.)?github\.com\/)/i.test(trimmed)) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      )
      if (
        !['github.com', 'www.github.com'].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port ||
        !/^\/[^/]+\/?$/.test(url.pathname) ||
        !gitHubUsernamePattern.test(
          decodeURIComponent(url.pathname.replace(/^\/|\/$/g, '')),
        )
      ) {
        return null
      }
    } catch {
      return null
    }
  } else if (!/^@?[a-z\d-]+$/i.test(trimmed)) {
    return null
  }

  const username = normalizeGitHubProfileValue(trimmed)
  return username.length <= 39 && gitHubUsernamePattern.test(username)
    ? username
    : null
}

export const getProfileEditProposalCurrentValue = (
  records: ProfileRecords,
  field: ProfileEditProposal['field'],
  coinType?: number,
  linkTarget?: string,
): string | undefined => {
  if (field === 'eth_address' || field === 'address')
    return records.addresses.find(
      (record) =>
        record.coinType ===
        (field === 'eth_address' ? ETH_COIN_TYPE : coinType),
    )?.value
  if (field === 'link')
    return records.links.find((link) => link.name === linkTarget)?.url
  const definition = getProfileFieldDefinition(field)
  if (!definition) return undefined
  if (definition.storage === 'base') return records.base[definition.key]
  return records[definition.storage].find(
    (record) => record.key === definition.key,
  )?.value
}

const normalizeThemeValue = (value: string): string => {
  const trimmed = value.trim()
  const namedTheme = PROFILE_THEMES.find(
    ({ label }) => label.toLowerCase() === trimmed.toLowerCase(),
  )
  if (namedTheme) return namedTheme.value.toLowerCase()
  // Do not turn an absent or invalid old value into the default theme.
  return /^#[a-f\d]{6}$/i.test(trimmed)
    ? resolveThemeColor(trimmed).toLowerCase()
    : trimmed.toLowerCase()
}

const normalizeComparisonValue = (
  field: ProfileEditProposal['field'],
  value: string,
): string | null => {
  switch (field) {
    case 'github':
      return normalizeGitHubUsername(value)?.toLowerCase() ?? null
    case 'theme':
      return normalizeThemeValue(value)
    case 'eth_address':
      return value.toLowerCase()
    default:
      return value
  }
}

const getProposalLabel = (proposal: ProfileEditProposal) => {
  if (proposal.field === 'github') return 'GitHub username'
  if (proposal.field === 'eth_address') return 'ETH address'
  if (proposal.field === 'address')
    return `${getProfileNetwork(proposal.coinType)?.name ?? 'network'} address`
  if (proposal.field === 'link')
    return `${proposal.linkTarget ?? proposal.linkName} link`
  return (
    getProfileFieldDefinition(proposal.field)?.label.toLowerCase() ??
    'profile record'
  )
}

const checkLinkOperation = (
  records: ProfileRecords,
  proposal: Extract<ProfileEditProposal, { field: 'link' }>,
): string | null => {
  const target = proposal.linkTarget
  if (
    target &&
    records.links.filter((link) => link.name === target).length !== 1
  )
    return 'Choose one existing link with a unique title before replacing or removing it.'
  if (!target && records.links.some((link) => link.name === proposal.linkName))
    return 'A link with that title already exists. Ask to replace it or choose a different title.'
  if (
    proposal.linkTarget &&
    proposal.linkName !== proposal.linkTarget &&
    records.links.some((link) => link.name === proposal.linkName)
  )
    return 'Another link already uses the proposed title. Choose a unique title.'
  return null
}

const checkFeaturedOperation = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): string | null => {
  const definition = getProfileFieldDefinition(proposal.field)
  if (definition?.storage !== 'social')
    return 'Only existing social contact methods can be featured.'
  const current = records.social.find(
    (record) => record.key === definition.key,
  )?.value
  if (!current?.trim())
    return `Add ${definition.label} before featuring it on your profile.`
  const featured = parsePrimaryContactKeys(records.base)
  if (
    proposal.operation === 'feature' &&
    !featured.some((key) => key === definition.key) &&
    featured.length >= maxPrimaryContactMethods
  )
    return `You already feature ${maxPrimaryContactMethods} contact methods. Unfeature one before adding another.`
  return null
}

const checkSharedEthOperation = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): string | null => {
  const eth = records.addresses.find(
    (record) => record.coinType === ETH_COIN_TYPE,
  )?.value
  if (
    proposal.field !== 'address' ||
    !isEvmCoinType(proposal.coinType) ||
    !eth?.trim() ||
    validateAddressRecordValue(ETH_COIN_TYPE, eth)
  )
    return 'Set a valid Ethereum address before using it on an Ethereum-compatible chain.'
  return null
}

const checkProposalOperation = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): string | null => {
  if (proposal.field === 'link') return checkLinkOperation(records, proposal)
  if (proposal.operation === 'use_eth')
    return checkSharedEthOperation(records, proposal)
  if (proposal.operation === 'feature' || proposal.operation === 'unfeature')
    return checkFeaturedOperation(records, proposal)
  return null
}

/** Check a requested replacement against live records before prefilling the editor. */
export const checkProfileEditProposal = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): string | null => {
  const operationIssue = checkProposalOperation(records, proposal)
  if (operationIssue) return operationIssue
  if (proposal.expectedValue === undefined) return null

  const currentValue = getProfileEditProposalCurrentValue(
    records,
    proposal.field,
    proposal.field === 'address' ? proposal.coinType : undefined,
    proposal.field === 'link' ? proposal.linkTarget : undefined,
  )
  const expectedValue = normalizeComparisonValue(
    proposal.field,
    proposal.expectedValue,
  )
  if (
    currentValue?.trim() &&
    expectedValue !== null &&
    normalizeComparisonValue(proposal.field, currentValue) === expectedValue
  ) {
    return null
  }

  const currentDescription = currentValue?.trim()
    ? `is “${currentValue}”`
    : 'is not set'
  return `The current ${getProposalLabel(proposal)} ${currentDescription}. Your request expected “${proposal.expectedValue}”. Review the current value before replacing it.`
}
