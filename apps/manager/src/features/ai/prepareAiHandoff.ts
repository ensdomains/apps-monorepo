import * as v from 'valibot'
import { getBulkRenewDurationPrefill } from '@/features/bulk-renew/utils/durationPrefill'
import {
  hasSmartFilters,
  SMART_FILTER_KEYS,
  type SmartNameFilters,
} from '@/features/dashboard/smartNameSearch'
import { normalizeMigrationAiNames } from '@/features/migration/components/migrationAiPreset'
import type { ProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import {
  normalizeEth2LdName,
  normalizeProfileName,
} from '@/features/profile/service/profileName'
import {
  durationSearchSchema,
  renewalDurationSearchSchema,
} from '@/features/register-v2/utils/durationSearch'
import { isFutureTargetDate } from '@/features/renew/utils/targetDate'
import type { AiAction } from './intent'
import {
  type PreparedManagerAction,
  prepareManagerAction,
} from './managerActions'
import { prepareProfileAiDetails } from './profileAiPreparation'

export type PreparedAiAction =
  | PreparedManagerAction
  | {
      readonly intent: 'set_primary' | 'favorite' | 'view_name'
      readonly name: string
    }
  | {
      readonly intent: 'register'
      readonly name: string
      readonly durationDays: number
    }
  | {
      readonly intent: 'renew'
      readonly name: string
      readonly durationYears?: number
      readonly durationDays?: number
      readonly targetDate?: string
    }
  | {
      readonly intent: 'find_names' | 'bulk_renew'
      readonly filters: SmartNameFilters
      readonly names?: readonly string[]
      readonly durationDays?: number
      readonly durationYears?: number
      readonly targetDate?: string
    }
  | {
      readonly intent: 'migrate'
      readonly excludeManagerRestoration: boolean
      readonly allEligible?: true
      readonly names?: readonly string[]
    }
  | {
      readonly intent: 'edit_profile'
      readonly name: string
      readonly section:
        | 'general'
        | 'links'
        | 'contact'
        | 'addresses'
        | 'appearance'
      readonly link?: { readonly name: string; readonly url: string }
      readonly proposal?: ProfileEditProposal
    }
  | {
      readonly intent: 'notification'
      readonly preference:
        | 'favouritedNameExpiry'
        | 'ownedNameExpiry'
        | 'ensLabsUpdates'
      readonly enabled: boolean
    }

export type AiHandoffPreparation =
  | { readonly status: 'ready'; readonly action: PreparedAiAction }
  | {
      readonly status: 'needs_input'
      readonly field:
        | 'name'
        | 'durationDays'
        | 'durationYears'
        | 'url'
        | 'profileValue'
        | 'profileField'
        | 'durationUnit'
        | 'notificationPreference'
        | 'notificationEnabled'
        | 'profileNetwork'
        | 'profileLinkName'
        | 'profileLinkTarget'
        | 'address'
        | 'managerValue'
      readonly message: string
      readonly label?: string
      readonly placeholder?: string
      readonly multiline?: boolean
      readonly minimum?: number
      readonly options?: readonly {
        readonly value: string
        readonly label: string
      }[]
    }
  | { readonly status: 'invalid'; readonly message: string }

export type AiHandoffInputs = {
  readonly name?: string
  readonly durationDays?: number
  readonly durationYears?: number
  readonly url?: string
  readonly profileValue?: string
  readonly profileField?: string
  readonly durationUnit?: string
  readonly notificationPreference?: string
  readonly notificationEnabled?: string
  readonly profileNetwork?: string
  readonly profileLinkName?: string
  readonly profileLinkTarget?: string
  readonly address?: string
  readonly managerValue?: string
  readonly lastNames?: readonly string[]
  readonly lastFilters?: SmartNameFilters
}

const preferences = [
  { value: 'favouritedNameExpiry', label: 'Favourite name expiry' },
  { value: 'ownedNameExpiry', label: 'Owned name expiry' },
  { value: 'ensLabsUpdates', label: 'ENS Labs updates' },
] as const

const combineReferencedFilters = (
  previous: SmartNameFilters,
  additional: SmartNameFilters,
): SmartNameFilters | null => {
  for (const key of SMART_FILTER_KEYS) {
    if (
      key !== 'sort' &&
      previous[key] !== undefined &&
      additional[key] !== undefined &&
      previous[key] !== additional[key]
    ) {
      return null
    }
  }

  const filters = { ...previous, ...additional }
  if (filters.expiry !== 'expiring') return filters

  const previousDays =
    previous.expiry === 'expiring' ? (previous.withinDays ?? 30) : undefined
  const additionalDays =
    additional.expiry === 'expiring' ? (additional.withinDays ?? 30) : undefined
  const withinDays =
    previousDays === undefined
      ? additionalDays
      : additionalDays === undefined
        ? previousDays
        : Math.min(previousDays, additionalDays)
  return { ...filters, ...(withinDays !== undefined && { withinDays }) }
}

const getName = (actionName: string | undefined, inputs: AiHandoffInputs) =>
  (actionName ?? inputs.name)?.trim()

const prepareName = (
  actionName: string | undefined,
  inputs: AiHandoffInputs,
  candidates?: readonly string[],
):
  | { status: 'ready'; name: string }
  | Exclude<AiHandoffPreparation, { status: 'ready' }> => {
  const candidate = getName(actionName, inputs)
  if (!candidate) {
    return {
      status: 'needs_input',
      field: 'name',
      message: candidates
        ? 'Which of these names should I use?'
        : 'Which ENS name should I use?',
      ...(candidates && {
        options: candidates.map((name) => ({ value: name, label: name })),
      }),
    }
  }
  const name = normalizeProfileName(candidate)
  if (!name) return { status: 'invalid', message: 'Enter a valid ENS name.' }
  if (candidates && !candidates.includes(name))
    return {
      status: 'invalid',
      message: 'Choose one of the names in your request.',
    }
  return { status: 'ready', name }
}

type HandoffFailure = Exclude<AiHandoffPreparation, { status: 'ready' }>
type DurationAction = Extract<
  AiAction,
  { intent: 'register' | 'renew' | 'find_names' | 'bulk_renew' }
>
type ProfileAction = Extract<AiAction, { intent: 'edit_profile' }>

const durationUnits = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'years', label: 'Years' },
] as const

const prepareDurationInputs = (
  action: DurationAction,
  inputs: AiHandoffInputs,
):
  | { readonly status: 'ready'; readonly inputs: AiHandoffInputs }
  | HandoffFailure => {
  const unit = inputs.durationUnit
  if (unit !== undefined && !durationUnits.some(({ value }) => value === unit))
    return {
      status: 'invalid',
      message: 'Choose days, weeks, or years for the duration.',
    }
  if (action.durationAmount === undefined) return { status: 'ready', inputs }
  if (!unit) {
    if (!action.durationUnitRequested) return { status: 'ready', inputs }
    return {
      status: 'needs_input',
      field: 'durationUnit',
      message: `Is ${action.durationAmount} in days, weeks, or years?`,
      label: 'Duration unit',
      options: durationUnits,
    }
  }
  if (unit === 'years' && action.intent !== 'register')
    return { status: 'ready', inputs: { durationYears: action.durationAmount } }
  const multiplier = unit === 'years' ? 365 : unit === 'weeks' ? 7 : 1
  return {
    status: 'ready',
    inputs: { durationDays: action.durationAmount * multiplier },
  }
}

const prepareRegistration = (
  action: Extract<AiAction, { intent: 'register' }>,
  inputs: AiHandoffInputs,
  durationInputs: AiHandoffInputs,
): AiHandoffPreparation => {
  const name = prepareName(action.name, inputs, action.nameCandidates)
  if (name.status !== 'ready') return name
  if (!normalizeEth2LdName(name.name))
    return {
      status: 'invalid',
      message: 'Registration is available for second-level .eth names.',
    }
  const durationDays = action.durationDays ?? durationInputs.durationDays
  if (durationDays === undefined)
    return {
      status: 'needs_input',
      field: 'durationDays',
      message: 'How many days should the registration last? Minimum 28.',
      minimum: 28,
    }
  if (!v.safeParse(durationSearchSchema, { durationDays }).success)
    return {
      status: 'invalid',
      message: 'Enter a registration duration of at least 28 days.',
    }
  return {
    status: 'ready',
    action: { intent: 'register', name: name.name, durationDays },
  }
}

const prepareRenewal = (
  action: Extract<AiAction, { intent: 'renew' }>,
  inputs: AiHandoffInputs,
  durationInputs: AiHandoffInputs,
): AiHandoffPreparation => {
  const name = prepareName(action.name, inputs, action.nameCandidates)
  if (name.status !== 'ready') return name
  if (!normalizeEth2LdName(name.name))
    return {
      status: 'invalid',
      message: 'Renewal is available for second-level .eth names.',
    }
  const durationDays = action.durationDays ?? durationInputs.durationDays
  const durationYears = action.durationYears ?? durationInputs.durationYears
  if (action.targetDate !== undefined) {
    if (
      !isFutureTargetDate(action.targetDate) ||
      durationDays !== undefined ||
      durationYears !== undefined ||
      action.durationAmount !== undefined
    )
      return {
        status: 'invalid',
        message: 'Choose one valid future target date or one added duration.',
      }
    return {
      status: 'ready',
      action: {
        intent: 'renew',
        name: name.name,
        targetDate: action.targetDate,
      },
    }
  }
  if (durationDays === undefined && durationYears === undefined)
    return {
      status: 'needs_input',
      field: action.durationUnitRequested ? 'durationDays' : 'durationYears',
      message: action.durationUnitRequested
        ? 'How many days should be added? Enter one duration.'
        : 'How many years should be added?',
      minimum: 1,
    }
  if (
    !v.safeParse(renewalDurationSearchSchema, { durationDays, durationYears })
      .success
  )
    return { status: 'invalid', message: 'Enter one valid renewal duration.' }
  return {
    status: 'ready',
    action: { intent: 'renew', name: name.name, durationDays, durationYears },
  }
}

type CollectionAction = Extract<
  AiAction,
  { intent: 'find_names' | 'bulk_renew' }
>
const prepareCollectionDuration = (
  action: CollectionAction,
  inputs: AiHandoffInputs,
):
  | {
      status: 'ready'
      duration: {
        durationDays?: number
        durationYears?: number
        targetDate?: string
      }
    }
  | HandoffFailure => {
  const duration = prepareDurationInputs(action, inputs)
  if (duration.status !== 'ready') return duration
  const durationDays = action.durationDays ?? duration.inputs.durationDays
  const durationYears = action.durationYears ?? duration.inputs.durationYears
  if (
    action.targetDate !== undefined &&
    (action.durationAmount !== undefined || action.durationUnitRequested)
  )
    return {
      status: 'invalid',
      message: 'Choose either one target date or one added duration.',
    }
  if (
    action.durationUnitRequested &&
    durationDays === undefined &&
    durationYears === undefined
  )
    return {
      status: 'needs_input',
      field: 'durationDays',
      message:
        'How many days should be added to each name? Minimum 28 for bulk renewal.',
      minimum: 28,
    }
  const validation = getBulkRenewDurationPrefill({
    initialDurationDays: durationDays,
    initialDurationYears: durationYears,
    initialTargetDate: action.targetDate,
  })
  if (validation.status === 'invalid') return validation
  return {
    status: 'ready',
    duration: {
      ...(durationDays !== undefined && { durationDays }),
      ...(durationYears !== undefined && { durationYears }),
      ...(action.targetDate !== undefined && { targetDate: action.targetDate }),
    },
  }
}

const prepareNameSelection = (
  action: CollectionAction,
  inputs: AiHandoffInputs,
): AiHandoffPreparation => {
  const filters = action.referencedSelection
    ? inputs.lastFilters &&
      combineReferencedFilters(inputs.lastFilters, action.filters)
    : action.filters
  const names =
    action.names ?? (action.referencedSelection ? inputs.lastNames : undefined)
  if (
    !filters ||
    !(
      hasSmartFilters(filters) ||
      action.allNames ||
      action.referencedSelection ||
      names?.length
    )
  )
    return {
      status: 'invalid',
      message: action.referencedSelection
        ? 'First search for names, then reuse those names with compatible filters.'
        : 'Ask for a supported name status to narrow the list.',
    }
  if (names?.some((name) => normalizeProfileName(name) !== name))
    return {
      status: 'invalid',
      message: 'Use exact valid ENS names for this selection.',
    }
  const duration = prepareCollectionDuration(action, inputs)
  if (duration.status !== 'ready') return duration
  return {
    status: 'ready',
    action: {
      intent: action.intent,
      filters,
      ...(names && { names }),
      ...duration.duration,
    },
  }
}

const prepareProfile = (
  action: ProfileAction,
  inputs: AiHandoffInputs,
): AiHandoffPreparation => {
  const name = prepareName(action.name, inputs, action.nameCandidates)
  if (name.status !== 'ready') return name
  const prepared = prepareProfileAiDetails(action, inputs)
  if (prepared.status !== 'ready') return prepared
  return {
    status: 'ready',
    action: {
      intent: 'edit_profile',
      name: name.name,
      section: prepared.section,
      ...(prepared.proposal && { proposal: prepared.proposal }),
      ...(prepared.link && { link: prepared.link }),
    },
  }
}

const prepareNotification = (
  action: Extract<AiAction, { intent: 'notification' }>,
  inputs: AiHandoffInputs,
): AiHandoffPreparation => {
  const preference =
    action.preference ??
    preferences.find(({ value }) => value === inputs.notificationPreference)
      ?.value
  if (!preference)
    return {
      status: 'needs_input',
      field: 'notificationPreference',
      message: 'Which notifications would you like to change?',
      label: 'Notification preference',
      options: preferences,
    }
  const enabled =
    action.enabled ??
    (inputs.notificationEnabled === 'on'
      ? true
      : inputs.notificationEnabled === 'off'
        ? false
        : undefined)
  if (enabled === undefined)
    return {
      status: 'needs_input',
      field: 'notificationEnabled',
      message: 'Would you like to turn these notifications on or off?',
      label: 'Notification setting',
      options: [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ],
    }
  return {
    status: 'ready',
    action: { intent: 'notification', preference, enabled },
  }
}

export const prepareAiHandoff = (
  action: AiAction,
  inputs: AiHandoffInputs = {},
): AiHandoffPreparation => {
  if (action.intent === 'register' || action.intent === 'renew') {
    const duration = prepareDurationInputs(action, inputs)
    if (duration.status !== 'ready') return duration
    return action.intent === 'register'
      ? prepareRegistration(action, inputs, duration.inputs)
      : prepareRenewal(action, inputs, duration.inputs)
  }
  switch (action.intent) {
    case 'set_primary':
    case 'favorite':
    case 'view_name': {
      const name = prepareName(action.name, inputs, action.nameCandidates)
      if (name.status !== 'ready') return name
      return {
        status: 'ready',
        action: { intent: action.intent, name: name.name },
      }
    }
    case 'find_names':
    case 'bulk_renew':
      return prepareNameSelection(action, inputs)
    case 'migrate': {
      const selection =
        action.names === undefined
          ? undefined
          : normalizeMigrationAiNames(action.names)
      if (selection?.status === 'invalid') return selection
      return {
        status: 'ready',
        action: {
          intent: 'migrate',
          excludeManagerRestoration: action.excludeManagerRestoration,
          ...(action.allEligible &&
            !action.excludeManagerRestoration &&
            !selection && { allEligible: true }),
          ...(selection?.status === 'ok' && { names: selection.names }),
        },
      }
    }
    case 'edit_profile':
      return prepareProfile(action, inputs)
    case 'notification':
      return prepareNotification(action, inputs)
    case 'manager_action':
      return prepareManagerAction(action, inputs)
  }
}
