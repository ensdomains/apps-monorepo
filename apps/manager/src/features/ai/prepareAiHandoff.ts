import {
  hasSmartFilters,
  type SmartNameFilters,
} from '@/features/dashboard/smartNameSearch'
import {
  normalizeEth2LdName,
  normalizeProfileName,
} from '@/features/profile/service/profileName'
import { isSafeHttpUrl } from '@/features/profile/utils/safeUrl'
import type { AiAction } from './intent'

export type PreparedAiAction =
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
    }
  | {
      readonly intent: 'find_names' | 'bulk_renew'
      readonly filters: SmartNameFilters
    }
  | { readonly intent: 'migrate'; readonly excludeManagerRestoration: boolean }
  | {
      readonly intent: 'edit_profile'
      readonly name: string
      readonly section: 'general' | 'links' | 'contact' | 'addresses'
      readonly link?: { readonly name: string; readonly url: string }
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
      readonly field: 'name' | 'durationDays' | 'durationYears' | 'url'
      readonly message: string
    }
  | { readonly status: 'invalid'; readonly message: string }

export type AiHandoffInputs = {
  readonly name?: string
  readonly durationDays?: number
  readonly durationYears?: number
  readonly url?: string
  readonly lastFilters?: SmartNameFilters
}

const validDuration = (value: number | undefined): value is number =>
  value !== undefined &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 36500

const getName = (actionName: string | undefined, inputs: AiHandoffInputs) =>
  (actionName ?? inputs.name)?.trim()

const prepareName = (
  actionName: string | undefined,
  inputs: AiHandoffInputs,
):
  | { status: 'ready'; name: string }
  | Exclude<AiHandoffPreparation, { status: 'ready' }> => {
  const candidate = getName(actionName, inputs)
  if (!candidate) {
    return {
      status: 'needs_input',
      field: 'name',
      message: 'Which ENS name should I use?',
    }
  }
  const name = normalizeProfileName(candidate)
  if (!name) return { status: 'invalid', message: 'Enter a valid ENS name.' }
  return { status: 'ready', name }
}

export const prepareAiHandoff = (
  action: AiAction,
  inputs: AiHandoffInputs = {},
): AiHandoffPreparation => {
  switch (action.intent) {
    case 'set_primary':
    case 'favorite':
    case 'view_name': {
      const name = prepareName(action.name, inputs)
      if (name.status !== 'ready') return name
      return {
        status: 'ready',
        action: { intent: action.intent, name: name.name },
      }
    }
    case 'register': {
      const name = prepareName(action.name, inputs)
      if (name.status !== 'ready') return name
      if (!normalizeEth2LdName(name.name)) {
        return {
          status: 'invalid',
          message: 'Registration is available for second-level .eth names.',
        }
      }
      const durationDays = action.durationDays ?? inputs.durationDays
      if (durationDays === undefined) {
        return {
          status: 'needs_input',
          field: 'durationDays',
          message: 'How many days should the registration last? Minimum 28.',
        }
      }
      if (!validDuration(durationDays) || durationDays < 28) {
        return {
          status: 'invalid',
          message: 'Enter a registration duration of at least 28 days.',
        }
      }
      return {
        status: 'ready',
        action: { intent: 'register', name: name.name, durationDays },
      }
    }
    case 'renew': {
      const name = prepareName(action.name, inputs)
      if (name.status !== 'ready') return name
      if (!normalizeEth2LdName(name.name)) {
        return {
          status: 'invalid',
          message: 'Renewal is available for second-level .eth names.',
        }
      }
      const durationDays = action.durationDays ?? inputs.durationDays
      const durationYears = action.durationYears ?? inputs.durationYears
      if (durationDays === undefined && durationYears === undefined) {
        return {
          status: 'needs_input',
          field: 'durationYears',
          message: 'How many years should be added?',
        }
      }
      if (
        (durationDays !== undefined && !validDuration(durationDays)) ||
        (durationYears !== undefined &&
          (!validDuration(durationYears) || durationYears > 100)) ||
        (durationDays !== undefined && durationYears !== undefined)
      ) {
        return {
          status: 'invalid',
          message: 'Enter one valid renewal duration.',
        }
      }
      return {
        status: 'ready',
        action: {
          intent: 'renew',
          name: name.name,
          durationDays,
          durationYears,
        },
      }
    }
    case 'find_names':
    case 'bulk_renew': {
      const filters = action.referencedSelection
        ? inputs.lastFilters
        : action.filters
      if (!filters || !hasSmartFilters(filters)) {
        return {
          status: 'invalid',
          message: action.referencedSelection
            ? 'First search for names, then ask to renew those names.'
            : 'Ask for a supported name status to narrow the list.',
        }
      }
      return { status: 'ready', action: { intent: action.intent, filters } }
    }
    case 'migrate':
      return {
        status: 'ready',
        action: {
          intent: 'migrate',
          excludeManagerRestoration: action.excludeManagerRestoration,
        },
      }
    case 'edit_profile': {
      const name = prepareName(action.name, inputs)
      if (name.status !== 'ready') return name
      if (action.section !== 'links') {
        return {
          status: 'ready',
          action: {
            intent: 'edit_profile',
            name: name.name,
            section: action.section,
          },
        }
      }
      const url = action.value ?? inputs.url
      if (!url)
        return {
          status: 'needs_input',
          field: 'url',
          message: 'Paste the link URL to add.',
        }
      if (!isSafeHttpUrl(url)) {
        return { status: 'invalid', message: 'Use a valid http or https URL.' }
      }
      const host = new URL(url).hostname.toLowerCase()
      const linkName =
        host === 'github.com' || host.endsWith('.github.com')
          ? 'GitHub'
          : 'Link'
      return {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: name.name,
          section: 'links',
          link: { name: linkName, url },
        },
      }
    }
    case 'notification':
      return {
        status: 'ready',
        action: {
          intent: 'notification',
          preference: action.preference,
          enabled: action.enabled,
        },
      }
  }
}
