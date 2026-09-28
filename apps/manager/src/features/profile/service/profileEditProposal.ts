import {
  applyEthAddressChange,
  removeAddress,
  upsertAddress,
} from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/AddressesTab.helpers'
import { ETH_COIN_TYPE } from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
import { contactMethods } from '@/features/profile/components/dialogs/edit-profile/tabs/contact/constants'
import {
  getBaseWithPrimarySocialContactKeys,
  getPrimarySocialContactKeys,
  removeRecord,
  upsertRecordValue,
} from '@/features/profile/components/dialogs/edit-profile/tabs/contact/records'
import type { ProfileRecords } from '@/features/profile/types'
import {
  getProfileFieldDefinition,
  type ProfileOperation,
  type ProfileTextField,
} from './profileFieldRegistry'

export type ProfileEditProposal = (
  | { readonly field: ProfileTextField | 'eth_address'; readonly value: string }
  | {
      readonly field: 'address'
      readonly coinType: number
      readonly value: string
    }
  | {
      readonly field: 'link'
      readonly value: string
      readonly linkName: string
      readonly linkTarget?: string
    }
) & { readonly expectedValue?: string; readonly operation?: ProfileOperation }

const applyAddressProposal = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): ProfileRecords => {
  const coinType =
    proposal.field === 'address' ? proposal.coinType : ETH_COIN_TYPE
  const currentEthAddress =
    records.addresses.find((record) => record.coinType === ETH_COIN_TYPE)
      ?.value ?? ''
  const value =
    proposal.operation === 'use_eth' ? currentEthAddress : proposal.value
  const addresses =
    proposal.operation === 'remove'
      ? removeAddress(records.addresses, coinType)
      : coinType === ETH_COIN_TYPE
        ? applyEthAddressChange(records.addresses, currentEthAddress, value)
        : upsertAddress(records.addresses, coinType, value)
  return { ...records, addresses }
}

const applyLinkProposal = (
  records: ProfileRecords,
  proposal: Extract<ProfileEditProposal, { field: 'link' }>,
): ProfileRecords => {
  const next = { name: proposal.linkName, url: proposal.value }
  const links =
    proposal.operation === 'remove'
      ? records.links.filter((link) => link.name !== proposal.linkTarget)
      : proposal.linkTarget
        ? records.links.map((link) =>
            link.name === proposal.linkTarget
              ? {
                  ...next,
                  ...(proposal.operation === 'rename' && { url: link.url }),
                }
              : link,
          )
        : [...records.links, next]
  return { ...records, links }
}

const applyFeaturedContact = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): ProfileRecords => {
  const definition = getProfileFieldDefinition(proposal.field)
  const method = contactMethods.find(
    (method) => method.section === 'social' && method.key === definition?.key,
  )
  if (!method) return records
  const current = getPrimarySocialContactKeys(records.base)
  const keys =
    proposal.operation === 'feature'
      ? current.includes(method.key)
        ? current
        : [...current, method.key]
      : current.filter((key) => key !== method.key)
  return {
    ...records,
    base: getBaseWithPrimarySocialContactKeys(records.base, keys),
  }
}

export const applyProfileEditProposal = (
  records: ProfileRecords,
  proposal: ProfileEditProposal,
): ProfileRecords => {
  if (proposal.field === 'address' || proposal.field === 'eth_address')
    return applyAddressProposal(records, proposal)
  if (proposal.field === 'link') return applyLinkProposal(records, proposal)
  if (proposal.operation === 'feature' || proposal.operation === 'unfeature')
    return applyFeaturedContact(records, proposal)
  const definition = getProfileFieldDefinition(proposal.field)
  if (!definition) return records
  const { storage, key } = definition
  if (storage === 'base') {
    const base = { ...records.base }
    if (proposal.operation === 'remove') delete base[key]
    else base[key] = proposal.value
    return { ...records, base }
  }
  const values =
    proposal.operation === 'remove'
      ? removeRecord(records[storage], key)
      : upsertRecordValue(records[storage], key, proposal.value)
  const next = { ...records, [storage]: values }
  return proposal.operation === 'remove' && storage === 'social'
    ? applyFeaturedContact(next, { ...proposal, operation: 'unfeature' })
    : next
}
