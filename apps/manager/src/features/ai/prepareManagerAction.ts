import { getAddress, isAddress } from 'viem'
import {
  getProfileNetwork,
  profileNetworkOptions,
} from '@/features/profile/service/profileFieldRegistry'
import { normalizeProfileName } from '@/features/profile/service/profileName'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import { LOCALES, type SupportedLocale } from '@/lib/locales.config'
import {
  type ManagerAction,
  type ManagerActionInputs,
  type ManagerActionPreparation,
  type MigrationApprovalKind,
  migrationApprovalKinds,
  type NotificationTag,
  notificationTags,
} from './managerActions'

const ready = (action: ManagerAction): ManagerActionPreparation => ({
  status: 'ready',
  action,
})

const prepareName = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const target = action.name ?? inputs.name
  if (!target)
    return {
      status: 'needs_input',
      field: 'name',
      message: 'Which ENS name should I use?',
      label: 'ENS name',
      placeholder: 'name.eth',
      ...(action.nameCandidates?.length
        ? {
            options: action.nameCandidates.map((value) => ({
              value,
              label: value,
            })),
          }
        : {}),
    }
  const name = normalizeProfileName(target.trim())
  if (!name) return { status: 'invalid', message: 'Enter a valid ENS name.' }
  if (action.nameCandidates?.length && !action.nameCandidates.includes(name))
    return {
      status: 'invalid',
      message: 'Choose one of the ENS names in this request.',
    }
  return ready({ ...action, name })
}

const prepareAddress = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const address = action.address ?? inputs.address
  if (!address)
    return action.ownWallet
      ? ready(action)
      : {
          status: 'needs_input',
          field: 'address',
          message: 'Which wallet profile should I open?',
          label: 'Ethereum wallet address',
          placeholder: '0x…',
        }
  return isAddress(address)
    ? ready({ ...action, address: getAddress(address) })
    : { status: 'invalid', message: 'Enter a valid Ethereum wallet address.' }
}

const prepareProfileAddressCopy = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const named = prepareName(action, inputs)
  if (named.status !== 'ready') return named
  if (action.mainReceivingAddress && action.addressCoinType !== undefined)
    return { status: 'invalid', message: 'Choose one profile address to copy.' }
  if (action.mainReceivingAddress) return named
  const selected = action.addressCoinType ?? inputs.managerValue
  if (selected === undefined || selected === '')
    return {
      status: 'needs_input',
      field: 'managerValue',
      label: 'Address network',
      message: 'Which address on this profile should I copy?',
      options: [
        { value: 'main', label: 'Main receiving address' },
        ...profileNetworkOptions,
      ],
    }
  if (selected === 'main')
    return ready({ ...named.action, mainReceivingAddress: true })
  const coinType =
    typeof selected === 'number'
      ? selected
      : /^\d+$/.test(selected)
        ? Number(selected)
        : Number.NaN
  return Number.isSafeInteger(coinType) && getProfileNetwork(coinType)
    ? ready({ ...named.action, addressCoinType: coinType })
    : { status: 'invalid', message: 'Choose an existing address network.' }
}

const prepareEmail = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const email = (action.email ?? inputs.managerValue)?.trim()
  if (!email)
    return {
      status: 'needs_input',
      field: 'managerValue',
      message: 'Which email should receive notifications?',
      label: 'Email address',
      placeholder: 'you@example.com',
    }
  return validateEmail(email)
    ? { status: 'invalid', message: 'Enter a valid email address.' }
    : ready({ ...action, email })
}

const prepareApproval = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const approval = action.approval ?? inputs.managerValue
  if (!approval)
    return {
      status: 'needs_input',
      field: 'managerValue',
      message: 'Which migration permission should I propose removing?',
      label: 'Migration permission',
      options: [
        { value: 'eth-registry:hca', label: 'Temporary smart account access' },
        { value: 'base-registrar:hca', label: 'Unwrapped .eth name access' },
        { value: 'name-wrapper:hca', label: 'Wrapped name access' },
      ],
    }
  return migrationApprovalKinds.includes(approval as MigrationApprovalKind)
    ? ready({ ...action, approval: approval as MigrationApprovalKind })
    : { status: 'invalid', message: 'Choose an existing migration permission.' }
}

const prepareLocale = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const locale = action.locale ?? inputs.managerValue
  if (!locale)
    return {
      status: 'needs_input',
      field: 'managerValue',
      message: 'Which interface language should I use?',
      label: 'Language',
      options: Object.entries(LOCALES).map(([value, label]) => ({
        value,
        label,
      })),
    }
  return Object.hasOwn(LOCALES, locale)
    ? ready({ ...action, locale: locale as SupportedLocale })
    : {
        status: 'invalid',
        message: 'Manager currently supports English and Swedish.',
      }
}

const prepareNotificationScope = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  const tag =
    action.notificationTag ??
    (action.notificationTagRequested ? inputs.managerValue : undefined)
  if (action.notificationTagRequested && !tag)
    return {
      status: 'needs_input',
      field: 'managerValue',
      label: 'Notification category',
      message: 'Which category of notifications should I use?',
      options: notificationTags
        .filter((value) => value !== 'all')
        .map((value) => ({
          value,
          label:
            value === 'updates'
              ? 'ENS updates'
              : value.charAt(0).toUpperCase() + value.slice(1),
        })),
    }
  if (tag !== undefined && !notificationTags.includes(tag as NotificationTag))
    return {
      status: 'invalid',
      message: 'Choose an existing notification category.',
    }
  return ready({
    ...action,
    ...(tag && { notificationTag: tag as NotificationTag }),
  })
}

export const prepareManagerAction = (
  action: ManagerAction,
  inputs: ManagerActionInputs,
): ManagerActionPreparation => {
  switch (action.kind) {
    case 'copy_profile_address':
      return prepareProfileAddressCopy(action, inputs)
    case 'unfavorite':
    case 'share_profile':
    case 'copy_profile':
    case 'copy_profile_owner':
    case 'view_profile_owner':
      return prepareName(action, inputs)
    case 'view_address':
      return prepareAddress(action, inputs)
    case 'email_add':
      return prepareEmail(action, inputs)
    case 'migration_revoke':
      return prepareApproval(action, inputs)
    case 'language':
      return prepareLocale(action, inputs)
    case 'show_notifications':
    case 'mark_notifications_read':
      return prepareNotificationScope(action, inputs)
    case 'email_remove':
    case 'email_resend':
      return action.email && validateEmail(action.email)
        ? { status: 'invalid', message: 'Enter a valid email address.' }
        : ready(action)
    default:
      return ready(action)
  }
}
