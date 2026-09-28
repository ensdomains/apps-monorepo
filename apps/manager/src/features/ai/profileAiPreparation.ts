import { isEvmCoinType } from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
import { DESCRIPTION_MAX_LENGTH } from '@/features/profile/components/dialogs/edit-profile/tabs/general/fields'
import { profileLanguageOptions } from '@/features/profile/components/dialogs/edit-profile/tabs/general/profileLanguages'
import { getLinkValidationIssues } from '@/features/profile/components/dialogs/edit-profile/tabs/links/validation'
import { PROFILE_THEMES } from '@/features/profile/constants'
import { getRecordDef } from '@/features/profile/data/records'
import type { ProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import {
  getProfileFieldDefinition,
  getProfileNetwork,
  type ProfileField,
  type ProfileOperation,
  type ProfileSection,
  profileFieldOptions,
  profileNetworkOptions,
} from '@/features/profile/service/profileFieldRegistry'
import { normalizeGitHubUsername } from '@/features/profile/service/profileRecordProposal'
import { isSafeHttpUrl } from '@/features/profile/utils/safeUrl'
import { validateAddressRecordValue } from '@/features/profile/utils/validateAddress'
import {
  validateEmail,
  validateUrl,
} from '@/features/profile/utils/validateUrl'

export type ProfileActionDetails = {
  readonly section: ProfileSection
  readonly field?: ProfileField
  readonly value?: string
  readonly expectedValue?: string
  readonly operation?: ProfileOperation
  readonly addressCoinType?: number
  readonly linkName?: string
  readonly linkTarget?: string
  readonly linkTargetRequested?: boolean
  readonly fieldRequested?: boolean
  readonly linkRequested?: boolean
  readonly linkService?: 'github'
}

export type ProfileAiInputs = {
  readonly profileField?: string
  readonly profileValue?: string
  readonly profileNetwork?: string
  readonly profileLinkName?: string
  readonly profileLinkTarget?: string
  readonly url?: string
}

type ProfileAiFailure =
  | { readonly status: 'invalid'; readonly message: string }
  | {
      readonly status: 'needs_input'
      readonly field:
        | 'profileField'
        | 'profileValue'
        | 'profileNetwork'
        | 'profileLinkName'
        | 'profileLinkTarget'
        | 'url'
      readonly message: string
      readonly label?: string
      readonly placeholder?: string
      readonly multiline?: boolean
      readonly options?: readonly {
        readonly value: string
        readonly label: string
      }[]
    }

export type ProfileAiPreparation =
  | ProfileAiFailure
  | {
      readonly status: 'ready'
      readonly section: ProfileSection
      readonly proposal?: ProfileEditProposal
      readonly link?: { readonly name: string; readonly url: string }
    }

const invalid = (message: string): ProfileAiFailure => ({
  status: 'invalid',
  message,
})

const valuePlaceholders: Partial<Record<ProfileField, string>> = {
  github: 'username or github.com/username',
  email: 'you@example.com',
  eth_address: '0x…',
  description: 'Write the description to use',
  avatar: 'https://example.com/image.png',
  header: 'https://example.com/image.png',
}
const specialFieldLabels: Partial<Record<ProfileField, string>> = {
  eth_address: 'Ethereum address',
  address: 'Network address',
}
const valueDetails = (field: ProfileField) => ({
  label:
    specialFieldLabels[field] ??
    getProfileFieldDefinition(field)?.label ??
    'Profile value',
  placeholder: valuePlaceholders[field],
  ...(field === 'description' && { multiline: true }),
})

const askValue = (field: ProfileField): ProfileAiFailure => {
  const details = valueDetails(field)
  const options =
    field === 'theme'
      ? PROFILE_THEMES.map(({ label }) => ({ value: label, label }))
      : field === 'language'
        ? profileLanguageOptions
        : field === 'timezone'
          ? Array.from({ length: 27 }, (_, index) => {
              const offset = index - 12
              const value = `UTC${offset >= 0 ? '+' : ''}${offset}`
              return { value, label: value }
            })
          : undefined
  return {
    status: 'needs_input',
    field: 'profileValue',
    message: `What ${details.label.toLowerCase()} should I propose?`,
    ...details,
    ...(options && { options }),
  }
}

const normalizeTimezone = (value: string): string | null => {
  const match = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})$/i.exec(value)
  if (!match) return null
  const offset = Number(`${match[1]}${match[2]}`)
  return offset >= -12 && offset <= 14
    ? `UTC${offset >= 0 ? '+' : ''}${offset}`
    : null
}

const normalizeTextValue = (
  field: ProfileField,
  value: string,
): string | null => {
  if (field === 'github') return normalizeGitHubUsername(value)
  if (field === 'theme')
    return (
      PROFILE_THEMES.find(
        (theme) =>
          theme.label.toLowerCase() === value.toLowerCase() ||
          theme.value.toLowerCase() === value.toLowerCase(),
      )?.value ?? null
    )
  if (field === 'language')
    return (
      profileLanguageOptions.find(
        (language) =>
          language.value === value.toLowerCase() ||
          language.label.toLowerCase() === value.toLowerCase(),
      )?.value ?? null
    )
  if (field === 'timezone') return normalizeTimezone(value)

  const definition = getProfileFieldDefinition(field)
  return definition?.storage === 'social'
    ? (getRecordDef(definition.key)?.normalize?.(value) ?? value)
    : value
}

const getValueError = (
  field: ProfileField,
  value: string,
): string | undefined => {
  if (field === 'description' && value.length > DESCRIPTION_MAX_LENGTH)
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`
  if ((field === 'avatar' || field === 'header') && !isSafeHttpUrl(value))
    return 'Use a valid http or https image URL.'
  if (field === 'website') return validateUrl(value)
  if (field === 'email') return validateEmail(value)
  if (field === 'eth_address') return validateAddressRecordValue(60, value)
  return undefined
}

const resolveField = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileField | ProfileAiFailure | undefined => {
  if (details.field) return details.field
  if (!details.fieldRequested) return undefined
  const isSocialOperation =
    details.operation === 'feature' || details.operation === 'unfeature'
  const options = isSocialOperation
    ? profileFieldOptions.filter(
        ({ value }) => getProfileFieldDefinition(value)?.storage === 'social',
      )
    : profileFieldOptions
  const field = options.find(
    (option) => option.value === inputs.profileField,
  )?.value
  return (
    field ?? {
      status: 'needs_input',
      field: 'profileField',
      label: isSocialOperation ? 'Social contact' : 'Profile field',
      message: isSocialOperation
        ? `Which social contact would you like to ${details.operation === 'feature' ? 'feature' : 'unfeature'}?`
        : 'Which profile field would you like to change?',
      options,
    }
  )
}

const prepareLinkRename = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const linkTarget = details.linkTarget ?? inputs.profileLinkTarget
  if (!linkTarget)
    return {
      status: 'needs_input',
      field: 'profileLinkTarget',
      message: 'Name the existing link to rename.',
    }
  const title = (details.linkName ?? inputs.profileLinkName)?.trim()
  if (!title)
    return {
      status: 'needs_input',
      field: 'profileLinkName',
      label: 'New link title',
      message: 'What title should replace the existing link title?',
    }
  if (
    getLinkValidationIssues([{ name: title, url: 'https://example.com' }])
      .length
  )
    return invalid('Choose a valid, non-reserved link title.')
  return {
    status: 'ready',
    section: 'links',
    proposal: {
      field: 'link',
      operation: 'rename',
      value: '',
      linkName: title,
      linkTarget,
    },
  }
}

const prepareLinkRemoval = (
  explicitName: string | undefined,
  expectedValue: string | undefined,
): ProfileAiPreparation => {
  if (!explicitName?.trim())
    return {
      status: 'needs_input',
      field: 'profileLinkName',
      label: 'Existing link title',
      message: 'What is the exact title of the link to remove?',
    }
  if (expectedValue !== undefined && !isSafeHttpUrl(expectedValue))
    return invalid('Specify the exact valid URL of the link to remove.')
  return {
    status: 'ready',
    section: 'links',
    proposal: {
      field: 'link',
      operation: 'remove',
      value: '',
      linkName: explicitName.trim(),
      linkTarget: explicitName.trim(),
      ...(expectedValue !== undefined && { expectedValue }),
    },
  }
}

const finishLinkPreparation = (
  details: ProfileActionDetails,
  linkName: string,
  value: string,
): ProfileAiPreparation => {
  if (
    !details.field &&
    !details.operation &&
    !details.linkName &&
    !details.linkTarget
  )
    return {
      status: 'ready',
      section: 'links',
      link: { name: linkName, url: value },
    }
  return {
    status: 'ready',
    section: 'links',
    proposal: {
      field: 'link',
      value,
      linkName,
      ...(details.linkTarget && { linkTarget: details.linkTarget }),
      ...(details.expectedValue && { expectedValue: details.expectedValue }),
    },
  }
}

const getLinkTargetIssue = (
  details: ProfileActionDetails,
  value: string,
): string | null => {
  if (!isSafeHttpUrl(value)) return 'Use a valid http or https URL.'
  const host = new URL(value).hostname.toLowerCase()
  const github = host === 'github.com' || host.endsWith('.github.com')
  if (details.linkService === 'github' && !github)
    return 'Use a github.com URL for a GitHub link.'
  if (details.expectedValue && !details.linkTarget)
    return 'Name the existing link to replace so Manager can check its current URL.'
  return null
}

const prepareLink = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  if (details.linkTargetRequested && !details.linkTarget) {
    if (!inputs.profileLinkTarget?.trim())
      return {
        status: 'needs_input',
        field: 'profileLinkTarget',
        label: 'Existing link title',
        message: 'Which existing link should I replace?',
      }
    return prepareLink(
      {
        ...details,
        linkTarget: inputs.profileLinkTarget.trim(),
        linkTargetRequested: false,
      },
      inputs,
    )
  }
  return prepareResolvedLink(details, inputs)
}

const prepareResolvedLink = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const operation = details.operation ?? 'set'
  if (operation === 'rename') return prepareLinkRename(details, inputs)
  if (operation !== 'set' && operation !== 'remove')
    return invalid('Choose adding, replacing, or removing a named link.')
  const explicitName =
    details.linkName ?? details.linkTarget ?? inputs.profileLinkName
  if (operation === 'remove')
    return prepareLinkRemoval(explicitName, details.expectedValue)
  const value = details.value ?? inputs.url ?? inputs.profileValue
  if (!value)
    return {
      status: 'needs_input',
      field: 'url',
      message: 'Paste the link URL to add.',
    }
  const targetIssue = getLinkTargetIssue(details, value)
  if (targetIssue) return invalid(targetIssue)
  const github = new URL(value).hostname.toLowerCase() === 'github.com'
  const linkName = explicitName?.trim() || (github ? 'GitHub' : 'Link')
  const issue = getLinkValidationIssues([{ name: linkName, url: value }])[0]
  if (issue) return invalid(issue.message)
  return finishLinkPreparation(details, linkName, value)
}

const prepareAddressValue = (
  coinType: number,
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const value = (details.value ?? inputs.profileValue)?.trim()
  // A person, ENS name or possessive reference is not an address. Ask locally.
  if (!value || /(?:['’]s\s+address|\.eth\b)/i.test(value))
    return askValue('address')
  const issue = validateAddressRecordValue(coinType, value)
  if (issue) return invalid(issue)
  if (
    details.expectedValue &&
    validateAddressRecordValue(coinType, details.expectedValue)
  )
    return invalid('Specify the exact valid network address to replace.')
  return {
    status: 'ready',
    section: 'addresses',
    proposal: {
      field: 'address',
      coinType,
      value,
      ...(details.expectedValue && { expectedValue: details.expectedValue }),
    },
  }
}

const prepareAddressOperation = (
  coinType: number,
  operation: 'remove' | 'use_eth',
  expectedValue: string | undefined,
): ProfileAiPreparation => {
  if (
    expectedValue !== undefined &&
    validateAddressRecordValue(coinType, expectedValue)
  )
    return invalid('Specify the exact valid network address to remove.')
  return {
    status: 'ready',
    section: 'addresses',
    proposal: {
      field: 'address',
      coinType,
      operation,
      value: '',
      ...(expectedValue !== undefined && { expectedValue }),
    },
  }
}

const prepareAddress = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const suppliedNetwork = inputs.profileNetwork
  const coinType =
    details.addressCoinType ??
    (suppliedNetwork && /^\d+$/.test(suppliedNetwork)
      ? Number(suppliedNetwork)
      : undefined)
  if (!getProfileNetwork(coinType))
    return {
      status: 'needs_input',
      field: 'profileNetwork',
      label: 'Network',
      message: 'Which network address should I change?',
      options: profileNetworkOptions,
    }
  if (coinType === undefined) return invalid('Choose a supported network.')
  const operation = details.operation ?? 'set'
  if (operation === 'rename') return invalid('Only named links can be renamed.')
  if (operation === 'feature' || operation === 'unfeature')
    return invalid('Only social contact methods can be featured.')
  if (operation === 'use_eth' && !isEvmCoinType(coinType))
    return invalid(
      'Only Ethereum-compatible chains can use your Ethereum address.',
    )
  if (operation === 'remove' || operation === 'use_eth')
    return prepareAddressOperation(coinType, operation, details.expectedValue)
  return prepareAddressValue(coinType, details, inputs)
}

const prepareTextValue = (
  field: Exclude<ProfileField, 'address' | 'link'>,
  section: ProfileSection,
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const supplied = (details.value ?? inputs.profileValue)?.trim()
  if (
    !supplied ||
    (field === 'eth_address' && /(?:['’]s\s+address|\.eth\b)/i.test(supplied))
  )
    return askValue(field)
  const value = normalizeTextValue(field, supplied)
  if (!value)
    return invalid(`Enter a valid ${valueDetails(field).label.toLowerCase()}.`)
  const issue = getValueError(field, value)
  if (issue) return invalid(issue)
  const expectedValue =
    details.expectedValue === undefined
      ? undefined
      : normalizeTextValue(field, details.expectedValue)
  if (
    expectedValue === null ||
    (expectedValue && getValueError(field, expectedValue))
  )
    return invalid(
      'The previous profile value is invalid. Specify the exact value to replace.',
    )
  return {
    status: 'ready',
    section,
    proposal: {
      field,
      value,
      ...(expectedValue !== undefined && { expectedValue }),
    },
  }
}

const prepareTextRecord = (
  field: Exclude<ProfileField, 'address' | 'link'>,
  details: ProfileActionDetails,
  inputs: ProfileAiInputs,
): ProfileAiPreparation => {
  const definition = getProfileFieldDefinition(field)
  const section = definition?.section ?? 'addresses'
  const operation = details.operation ?? 'set'
  if (operation === 'rename') return invalid('Only named links can be renamed.')
  if (operation === 'use_eth')
    return invalid('Choose the Ethereum-compatible network to enable.')
  if (
    (operation === 'feature' || operation === 'unfeature') &&
    definition?.storage !== 'social'
  )
    return invalid('Only social contact methods can be featured.')
  if (operation !== 'set') {
    const expectedValue =
      details.expectedValue === undefined
        ? undefined
        : normalizeTextValue(field, details.expectedValue)
    if (
      expectedValue === null ||
      (expectedValue && getValueError(field, expectedValue))
    )
      return invalid('Specify the exact valid profile value to remove.')
    return {
      status: 'ready',
      section,
      proposal: {
        field,
        operation,
        value: '',
        ...(expectedValue !== undefined && { expectedValue }),
      },
    }
  }
  return prepareTextValue(field, section, details, inputs)
}

/** Produces a draft proposal for the existing editor. It never saves records. */
export const prepareProfileAiDetails = (
  details: ProfileActionDetails,
  inputs: ProfileAiInputs = {},
): ProfileAiPreparation => {
  const field = resolveField(details, inputs)
  if (typeof field === 'object') return field
  if (field === 'address') return prepareAddress(details, inputs)
  if (
    field === 'link' ||
    (!field &&
      details.section === 'links' &&
      (details.linkRequested || details.value))
  )
    return prepareLink(details, inputs)
  if (!field) return { status: 'ready', section: details.section }
  return prepareTextRecord(field, details, inputs)
}
