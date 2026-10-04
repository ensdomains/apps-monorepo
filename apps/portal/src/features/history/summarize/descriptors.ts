import {
  type ContractRef,
  type MigrationPath,
  type Power,
  parseRecordKey,
} from '@ens-apps/bigname'
import { isAddress, zeroAddress } from 'viem'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { recordValueText } from '@/utils/history/recordValue'
import {
  type HistoryEventType,
  isKnownHistoryEventType,
  type TimelineEvent,
  type TimelineEventOfType,
} from '../timelineEvent'
import type {
  ActionSlot,
  Descriptor,
  DescriptorResult,
} from './summarize.types'

const isZero = (value?: string | null): boolean =>
  !value || value.toLowerCase() === zeroAddress

/** Sentence-case a camel-cased raw kind, e.g. `LabelRegistered` → "Label registered". */
export const humanizeType = (type: string): string =>
  type
    .replace(/_/g, ' ')
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

/** A power in words: `set_addr` → "Set addr", `admin_set_text` → "Set text Admin". */
export const formatPower = (power: Power | string): string =>
  power.startsWith('admin_')
    ? `${humanizeType(power.slice('admin_'.length))} Admin`
    : humanizeType(power)

const nameSlot = (value?: string | null): ActionSlot =>
  value ? { kind: 'name', value } : { kind: 'placeholder', value: '—' }

const addressSlot = (value?: string | null): ActionSlot =>
  value && isAddress(value, { strict: false })
    ? { kind: 'address', value }
    : { kind: 'placeholder', value: '—' }

const contractSlot = (
  value?: ContractRef | null,
  opts?: { isRegistry?: boolean; label?: string },
): ActionSlot => {
  if (!value || !isAddress(value.address, { strict: false })) {
    return { kind: 'placeholder', value: '—' }
  }
  return {
    kind: 'contract',
    value: value.address,
    ...(opts?.isRegistry ? { isRegistry: true } : {}),
    ...(opts?.label ? { label: opts.label } : {}),
  }
}

/** Hex values (contenthash, non-EVM address bytes) are shortened; text is sanitized. */
const valueSlot = (value?: string): ActionSlot => {
  if (!value) return { kind: 'placeholder', value: '—' }
  if (value.startsWith('0x') && value.length > 16)
    return { kind: 'text', value: truncateAddress(value, 6, 4, '…') }
  return { kind: 'text', value: sanitizeOnChainText(value) || '—' }
}

/**
 * The record family a `record` row's key names, for labels. `key` is the stored
 * key and may sit outside the records grammar (`name`, `abi:<content_type>`).
 */
export type RecordFamily =
  | 'cleared'
  | 'text'
  | 'address'
  | 'contenthash'
  | 'name'
  | 'abi'
  | 'pubkey'
  | 'interface'
  | 'other'

export const recordFamily = (
  event: TimelineEventOfType<'record'>,
): RecordFamily => {
  // A record-version reset (clearRecords) carries no fields at all.
  if (event.kind === 'RecordVersionChanged') return 'cleared'
  const key = event.data.key
  if (!key) return 'other'
  const parsed = parseRecordKey(key)
  if (parsed?.kind === 'text' || parsed?.kind === 'avatar') return 'text'
  if (parsed?.kind === 'addr') return 'address'
  if (parsed?.kind === 'contenthash') return 'contenthash'
  if (key === 'name') return 'name'
  if (key.startsWith('abi')) return 'abi'
  if (key.startsWith('pubkey')) return 'pubkey'
  if (key.startsWith('interface')) return 'interface'
  return 'other'
}

/** The text key of a `text:<key>` row, sanitized; the key is attacker-authored. */
export const recordTextKey = (event: TimelineEventOfType<'record'>): string => {
  const key = event.data.key ?? ''
  const bare = key.startsWith('text:') ? key.slice('text:'.length) : key
  return sanitizeOnChainText(bare) || 'text'
}

const describeRecord = (
  primary: TimelineEventOfType<'record'>,
): DescriptorResult => {
  const value = recordValueText(primary.data.value)
  switch (recordFamily(primary)) {
    case 'cleared':
      return { label: 'cleared records', slots: [] }
    case 'text': {
      const slots: ActionSlot[] = [
        { kind: 'text', value: recordTextKey(primary) },
      ]
      const text = sanitizeOnChainText(value ?? '')
      if (text)
        slots.push({ kind: 'glyph', value: '→' }, { kind: 'text', value: text })
      return { icon: 'text', label: 'set text record', slots }
    }
    case 'address':
      return {
        icon: 'address',
        label: 'set address to',
        slots: [
          value && isAddress(value, { strict: false })
            ? addressSlot(value)
            : valueSlot(value),
        ],
      }
    case 'contenthash':
      return {
        icon: 'contenthash',
        label: 'set content hash to',
        slots: [valueSlot(value)],
      }
    case 'name':
      // History keeps the key of a `name()` write but not the name itself.
      return value
        ? {
            icon: 'primary',
            label: 'set primary name to',
            slots: [nameSlot(value)],
          }
        : { icon: 'primary', label: 'set reverse name record', slots: [] }
    case 'abi':
      return { label: 'changed ABI', slots: [] }
    case 'pubkey':
      return { label: 'changed public key', slots: [] }
    case 'interface':
      return { label: 'set interface', slots: [] }
    case 'other':
      return {
        label: 'set record',
        slots: [
          {
            kind: 'text',
            value: sanitizeOnChainText(primary.data.key ?? '') || '—',
          },
        ],
      }
  }
}

const powerList = (powers: readonly Power[]): ActionSlot => ({
  kind: 'text',
  value: powers.map(formatPower).join(', '),
})

/** The grantee of a permission row, attributed to its transaction when known. */
const permissionAccount = (
  primary: TimelineEventOfType<'permission'>,
): ActionSlot => {
  const { address } = primary.data
  if (!address || !isAddress(address, { strict: false }))
    return { kind: 'placeholder', value: '—' }
  return primary.transactionHash
    ? { kind: 'actor', txHash: primary.transactionHash, address }
    : { kind: 'address', value: address }
}

/**
 * An ENSv2 registry role change states what it granted and revoked; a change
 * that only grants or only revokes reads as that. Other rows (other eras, or
 * a change that does both) are undefined here and read from `powers`.
 */
const describePowerDiff = (
  added: readonly Power[] | undefined,
  removed: readonly Power[] | undefined,
  account: ActionSlot,
): DescriptorResult | undefined => {
  if (!added || !removed) return undefined
  if (added.length > 0 && removed.length === 0)
    return {
      label: 'granted roles',
      slots: [powerList(added), { kind: 'connective', value: 'to' }, account],
    }
  if (removed.length > 0 && added.length === 0)
    return {
      icon: 'revoke',
      label: 'revoked roles',
      slots: [
        powerList(removed),
        { kind: 'connective', value: 'from' },
        account,
      ],
    }
  return undefined
}

const describePermission = (
  primary: TimelineEventOfType<'permission'>,
): DescriptorResult => {
  const {
    powers,
    added_powers: added,
    removed_powers: removed,
    fuses,
    grant_scope: scope,
    approved,
  } = primary.data
  const account = permissionAccount(primary)
  // A BaseRegistrar controller change: registrar-wide, no power set.
  if (scope?.kind === 'registrar_controller')
    return approved === false
      ? {
          icon: 'revoke',
          label: 'removed registrar controller',
          slots: [account],
        }
      : { label: 'added registrar controller', slots: [account] }
  if (!powers && fuses !== undefined)
    return { icon: 'fuses', label: 'set fuses', slots: [] }
  const diff = describePowerDiff(added, removed, account)
  if (diff) return diff
  // `powers` is the subject's power set after the change; an empty set is
  // every role gone.
  if (!powers?.length)
    return {
      icon: 'revoke',
      label: 'revoked roles from',
      slots: [account],
    }
  return {
    label: 'set roles',
    slots: [powerList(powers), { kind: 'connective', value: 'for' }, account],
  }
}

const MIGRATION_PATH_LABELS: Record<MigrationPath, string> = {
  unwrapped: 'unwrapped',
  unlocked_wrapped: 'wrapped',
  locked_wrapped: 'locked',
  locked_child: 'locked subname',
  emancipated_child: 'emancipated subname',
}

const describeMigration = (
  primary: TimelineEventOfType<'migration'>,
): DescriptorResult => {
  const path = primary.data.migration_path
  return {
    label: 'migrated',
    slots: [
      nameSlot(primary.name),
      { kind: 'connective', value: 'to ENSv2' },
      ...(path && MIGRATION_PATH_LABELS[path]
        ? [
            {
              kind: 'connective' as const,
              value: `(${MIGRATION_PATH_LABELS[path]})`,
            },
          ]
        : []),
    ],
  }
}

type Descriptors = {
  readonly [TType in HistoryEventType]: Descriptor<TimelineEventOfType<TType>>
}

/**
 * Labels are lowercase past-tense verb phrases: every row is rendered as
 * "{actor} {label} {slots}", with the transaction sender as its subject (see
 * `summarizeEvents`), so a label must read on from a name or an address.
 */
export const DESCRIPTORS: Descriptors = {
  registration: {
    icon: 'register',
    build: (primary) =>
      primary.subject === 'child'
        ? {
            icon: 'subname',
            label: 'registered subname',
            slots: [nameSlot(primary.name)],
          }
        : { label: 'registered', slots: [nameSlot(primary.name)] },
  },
  renewal: {
    icon: 'renew',
    build: (primary) => ({ label: 'renewed', slots: [nameSlot(primary.name)] }),
  },
  release: {
    icon: 'expiry',
    build: (primary) => ({
      label: 'released',
      slots: [nameSlot(primary.name)],
    }),
  },
  expiry: {
    icon: 'expiry',
    build: () => ({ label: 'updated expiry', slots: [] }),
  },
  transfer: {
    icon: 'transfer',
    build: (primary) => {
      // A mint is the registration's own doing, not a transfer worth a headline.
      if (isZero(primary.data.from)) return null
      return {
        label: 'transferred',
        slots: [
          nameSlot(primary.name),
          { kind: 'glyph', value: '→' },
          addressSlot(primary.data.to),
        ],
      }
    },
  },
  authority: {
    icon: 'registry',
    build: (primary) => ({
      label: 'set registry owner to',
      slots: [addressSlot(primary.data.owner)],
    }),
  },
  resolver: {
    icon: 'resolver',
    build: (primary) =>
      primary.data.resolver
        ? {
            label: 'updated resolver to',
            slots: [contractSlot(primary.data.resolver, { label: 'resolver' })],
          }
        : { label: 'cleared resolver', slots: [] },
  },
  record: {
    icon: 'records',
    build: describeRecord,
  },
  primary_name: {
    icon: 'primary',
    build: (primary) => ({
      label: 'set primary name',
      slots: [
        nameSlot(primary.name),
        { kind: 'glyph', value: '↔' },
        addressSlot(primary.data.address),
      ],
    }),
  },
  permission: {
    icon: 'grant',
    build: describePermission,
  },
  subregistry: {
    icon: 'registry',
    build: (primary) =>
      primary.data.subregistry
        ? {
            label: 'linked subregistry',
            slots: [
              contractSlot(primary.data.subregistry, { isRegistry: true }),
            ],
          }
        : { label: 'unlinked subregistry', slots: [] },
  },
  migration: {
    icon: 'migrate',
    build: describeMigration,
  },
}

/**
 * A row of a type bigname added after `HISTORY_EVENT_TYPES` still renders: by
 * its raw kind when the read carried one, else by the type itself.
 */
const UNKNOWN_TYPE_DESCRIPTOR: Descriptor = {
  icon: 'default',
  build: (primary) => ({
    label: humanizeType(primary.kind ?? primary.type).toLowerCase(),
    slots: primary.name ? [nameSlot(primary.name)] : [],
  }),
}

const descriptorOf = (primary: TimelineEvent): Descriptor =>
  isKnownHistoryEventType(primary.type)
    ? (DESCRIPTORS[primary.type] as Descriptor)
    : UNKNOWN_TYPE_DESCRIPTOR

/**
 * Dispatch on the row's own type; the descriptor table is keyed exhaustively
 * over the known types, and an unknown one gets the generic descriptor.
 */
export const describeEvent = (
  primary: TimelineEvent,
): DescriptorResult | null => descriptorOf(primary).build(primary)

export const descriptorIcon = (primary: TimelineEvent) =>
  descriptorOf(primary).icon
