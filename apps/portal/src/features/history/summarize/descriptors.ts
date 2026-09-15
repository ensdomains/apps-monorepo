import { isAddress, zeroAddress } from 'viem'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { V1_PROTOCOL } from '../timelineEvent'
import {
  decodeRoleChange,
  parseEventData,
  readString,
  resolveDecodedName,
} from './decodeRawData'
import type { ActionSlot, Descriptor } from './summarize.types'

const isZero = (value?: string | null): boolean =>
  !value || value.toLowerCase() === zeroAddress

export const humanizeType = (type: string): string =>
  type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)(?=[A-Z][a-z])/g, '$1 ')
    .split(' ')
    .map((word, index) => {
      if (word.length > 1 && word === word.toUpperCase()) return word
      const lower = word.toLowerCase()
      return index === 0
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower
    })
    .join(' ')

const nameSlot = (value?: string | null): ActionSlot =>
  value ? { kind: 'name', value } : { kind: 'placeholder', value: '—' }

const addressSlot = (value?: string | null): ActionSlot =>
  value && isAddress(value, { strict: false })
    ? { kind: 'address', value }
    : { kind: 'placeholder', value: '—' }

const contractSlot = (
  value?: string | null,
  opts?: { isRegistry?: boolean; label?: string },
): ActionSlot => {
  if (!value || !isAddress(value, { strict: false })) {
    return { kind: 'placeholder', value: '—' }
  }
  return {
    kind: 'contract',
    value,
    ...(opts?.isRegistry ? { isRegistry: true } : {}),
    ...(opts?.label ? { label: opts.label } : {}),
  }
}

const resolvedNameSlot = (
  candidate?: string | null,
  eventName?: string | null,
): ActionSlot =>
  nameSlot(
    (candidate ? resolveDecodedName(candidate, eventName) : undefined) ??
      eventName,
  )

/**
 * Labels are lowercase past-tense verb phrases: every row is rendered as
 * "{actor} {label} {slots}", with the transaction sender as its subject (see
 * `summarizeEvents`), so a label must read on from a name or an address.
 */
export const DESCRIPTORS = {
  AddressChanged: {
    icon: 'address',
    build: (primary) => ({
      label: 'set address to',
      slots: [addressSlot(primary.asAddressChanged?.address)],
    }),
  },
  AddrChanged: {
    icon: 'address',
    build: (primary) => ({
      label: 'set address to',
      slots: [
        addressSlot(
          primary.asAddressChanged?.address ??
            readString(parseEventData(primary.data), 'address', 'addr'),
        ),
      ],
    }),
  },

  TextChanged: {
    icon: 'text',
    build: (primary) => {
      const key = sanitizeOnChainText(
        primary.asTextChanged?.key ?? primary.key ?? '—',
      )
      const value = sanitizeOnChainText(
        primary.asTextChanged?.value ?? primary.value ?? '',
      )
      const slots: ActionSlot[] = [{ kind: 'text', value: key }]
      if (value) {
        slots.push({ kind: 'glyph', value: '→' }, { kind: 'text', value })
      }
      return { label: 'set text record', slots }
    },
  },

  ContenthashChanged: {
    icon: 'contenthash',
    build: (primary) => {
      const hash = readString(
        parseEventData(primary.data),
        'hash',
        'contentHash',
      )
      return {
        label: 'set content hash to',
        slots: [
          {
            kind: 'text',
            value: hash ? truncateAddress(hash, 6, 4, '…') : '—',
          },
        ],
      }
    },
  },

  NameChanged: {
    icon: 'primary',
    build: (primary) => {
      const setName =
        readString(parseEventData(primary.data), 'name') ?? primary.name
      return {
        label: 'set primary name to',
        slots: [nameSlot(setName)],
      }
    },
  },
  ReverseClaimed: {
    icon: 'primary',
    build: (primary) => ({
      label: 'set primary name',
      slots: [
        nameSlot(primary.name),
        { kind: 'glyph', value: '↔' },
        addressSlot(primary.asReverseClaimed?.address),
      ],
    }),
  },

  Transfer: {
    icon: 'transfer',
    build: (primary) => {
      if (isZero(primary.asTransfer?.from)) return null
      return {
        label: 'transferred',
        slots: [
          nameSlot(primary.name),
          { kind: 'glyph', value: '→' },
          addressSlot(primary.asTransfer?.to),
        ],
      }
    },
  },
  RegistryTransfer: {
    icon: 'transfer',
    build: (primary) => ({
      label: 'transferred',
      slots: [
        nameSlot(primary.name),
        { kind: 'glyph', value: '→' },
        addressSlot(primary.asRegistryTransfer?.owner),
      ],
    }),
  },

  LabelRegistered: {
    icon: 'subname',
    build: (primary) => ({
      label: 'registered subname',
      slots: [resolvedNameSlot(primary.asLabelRegistered?.name, primary.name)],
    }),
  },
  NameRegistered: {
    icon: 'register',
    build: (primary) => ({
      label: 'registered',
      slots: [resolvedNameSlot(primary.asNameRegistered?.name, primary.name)],
    }),
  },
  NameRenewed: {
    icon: 'renew',
    build: (primary) => ({
      label: 'renewed',
      slots: [nameSlot(primary.name)],
    }),
  },

  ResolverUpdated: {
    icon: 'resolver',
    build: (primary) => ({
      label: 'updated resolver to',
      slots: [
        contractSlot(primary.asResolverUpdated?.resolver, {
          label: 'resolver',
        }),
      ],
    }),
  },

  SubregistryUpdated: {
    icon: 'registry',
    build: (primary) => {
      const registry = readString(
        parseEventData(primary.data),
        'registry',
        'subregistry',
      )
      if (isZero(registry)) {
        return { label: 'unlinked subregistry', slots: [] }
      }
      return {
        label: 'deployed and linked subregistry',
        slots: [contractSlot(registry, { isRegistry: true })],
      }
    },
  },

  EACRolesChanged: {
    icon: 'grant',
    build: (primary) => {
      const change = decodeRoleChange(primary.data)
      const roleText =
        change.roles
          .map((role) =>
            role.endsWith('_ADMIN')
              ? `${formatRoleLabel(role)} Admin`
              : formatRoleLabel(role),
          )
          .join(', ') || 'roles'
      const account: ActionSlot =
        change.account && isAddress(change.account, { strict: false })
          ? {
              kind: 'actor',
              txHash: primary.transactionHash,
              address: change.account,
            }
          : { kind: 'placeholder', value: '—' }

      if (change.direction === 'revoke') {
        return {
          icon: 'revoke',
          label: 'revoked role',
          slots: [
            { kind: 'text', value: roleText },
            { kind: 'connective', value: 'from' },
            account,
          ],
        }
      }
      if (change.direction === 'grant') {
        return {
          label: 'granted role',
          slots: [
            { kind: 'text', value: roleText },
            { kind: 'connective', value: 'to' },
            account,
          ],
        }
      }
      return {
        label: 'updated roles',
        slots: [{ kind: 'text', value: roleText }],
      }
    },
  },

  // The only two type names that mean different things across protocols: under
  // v1 these are the NameWrapper's wrap/unwrap, not the migration to v2.
  NameWrapped: {
    icon: 'migrate',
    build: (primary) =>
      primary.protocol === V1_PROTOCOL
        ? {
            label: 'wrapped',
            slots: [
              nameSlot(primary.name),
              { kind: 'connective', value: 'for' },
              addressSlot(primary.asNameWrapped?.owner),
            ],
          }
        : {
            label: 'migrated',
            slots: [
              nameSlot(primary.name),
              { kind: 'connective', value: 'to ENSv2' },
            ],
          },
  },
  NameUnwrapped: {
    icon: 'migrate',
    build: (primary) =>
      primary.protocol === V1_PROTOCOL
        ? {
            label: 'unwrapped',
            slots: [
              nameSlot(primary.name),
              { kind: 'connective', value: 'to' },
              addressSlot(primary.asNameUnwrapped?.owner),
            ],
          }
        : {
            label: 'unwrapped',
            slots: [
              nameSlot(primary.name),
              { kind: 'connective', value: 'from ENSv2' },
            ],
          },
  },
  FusesSet: {
    icon: 'fuses',
    build: () => ({ label: 'set fuses', slots: [] }),
  },
  ExpiryUpdated: {
    icon: 'expiry',
    build: () => ({ label: 'updated expiry', slots: [] }),
  },

  // ENS v1 types with no v2 counterpart, so no collision to disambiguate.
  NewOwner: {
    icon: 'registry',
    build: (primary) => ({
      label: 'set registry owner to',
      slots: [addressSlot(primary.asRegistryTransfer?.owner)],
    }),
  },
  WrappedTransfer: {
    icon: 'transfer',
    build: (primary) => ({
      label: 'transferred wrapped name',
      slots: [
        nameSlot(primary.name),
        { kind: 'glyph', value: '→' },
        addressSlot(primary.asTransfer?.to),
      ],
    }),
  },
  NameTransferred: {
    icon: 'transfer',
    build: (primary) => ({
      label: 'transferred registrant to',
      slots: [
        addressSlot(readString(parseEventData(primary.data), 'newOwner')),
      ],
    }),
  },
  NewTTL: {
    icon: 'registry',
    build: (primary) => ({
      label: 'set TTL to',
      slots: [
        {
          kind: 'text',
          value: readString(parseEventData(primary.data), 'ttl') ?? '—',
        },
      ],
    }),
  },
  AbiChanged: {
    icon: 'records',
    build: () => ({ label: 'changed ABI', slots: [] }),
  },
  PubkeyChanged: {
    icon: 'records',
    build: () => ({ label: 'changed public key', slots: [] }),
  },
  InterfaceChanged: {
    icon: 'records',
    build: (primary) => ({
      label: 'set interface',
      slots: [
        {
          kind: 'text',
          value: readString(parseEventData(primary.data), 'interfaceID') ?? '—',
        },
        { kind: 'glyph', value: '→' },
        addressSlot(readString(parseEventData(primary.data), 'implementer')),
      ],
    }),
  },
  AuthorisationChanged: {
    icon: 'grant',
    build: (primary) => ({
      label: 'changed authorisation for',
      slots: [addressSlot(readString(parseEventData(primary.data), 'target'))],
    }),
  },
  // The PublicResolver bumps the record version to clear every record at once.
  VersionChanged: {
    icon: 'records',
    build: () => ({ label: 'cleared records', slots: [] }),
  },
} satisfies Record<string, Descriptor>

/**
 * The event types the timeline knows how to describe. Scoped reads name these,
 * and the values are inlined into the indexer query text (see
 * `buildHistoryTimelineQuery`), so this union is what guarantees only our own
 * constants ever reach it.
 */
export type TimelineEventType = keyof typeof DESCRIPTORS
