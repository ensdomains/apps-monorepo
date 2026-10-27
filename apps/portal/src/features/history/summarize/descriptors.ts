import {
  type MigrationPath,
  type Power,
  parseRecordKey,
  type RegistryRef,
} from '@ens-apps/indexer/bigname'
import { match, P } from 'ts-pattern'
import { isAddress, zeroAddress } from 'viem'
import { isFuseChange } from '@/features/history/eventTypes'
import { sanitizeOnChainText } from '@/utils/formatting/sanitizeOnChainText'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { recordValueText } from '@/utils/history/recordValue'
import { rootPermissionRegistry } from '@/utils/history/rootPermission'
import {
  type EventType,
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
export const formatPower = (power: Power): string =>
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
  value?: RegistryRef | null,
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
  const key = event.data?.key
  if (!key) return 'other'
  return match(parseRecordKey(key)?.kind)
    .returnType<RecordFamily>()
    .with(P.union('text', 'avatar'), () => 'text')
    .with('addr', () => 'address')
    .with('contenthash', () => 'contenthash')
    .otherwise(() =>
      match(key)
        .returnType<RecordFamily>()
        .with('name', () => 'name')
        .with(P.string.startsWith('abi'), () => 'abi')
        .with(P.string.startsWith('pubkey'), () => 'pubkey')
        .with(P.string.startsWith('interface'), () => 'interface')
        .otherwise(() => 'other'),
    )
}

/** The text key of a `text:<key>` row, sanitized; the key is attacker-authored. */
export const recordTextKey = (event: TimelineEventOfType<'record'>): string => {
  const key = event.data?.key ?? ''
  const bare = key.startsWith('text:') ? key.slice('text:'.length) : key
  return sanitizeOnChainText(bare) || 'text'
}

const describeRecord = (
  primary: TimelineEventOfType<'record'>,
): DescriptorResult => {
  const value = recordValueText(primary.data?.value)
  return (
    match(recordFamily(primary))
      .returnType<DescriptorResult>()
      .with('cleared', () => ({ label: 'cleared records', slots: [] }))
      .with('text', () => {
        const text = sanitizeOnChainText(value ?? '')
        return {
          icon: 'text',
          label: 'set text record',
          slots: [
            { kind: 'text', value: recordTextKey(primary) },
            ...(text
              ? ([
                  { kind: 'glyph', value: '→' },
                  { kind: 'text', value: text },
                ] as const)
              : []),
          ],
        }
      })
      .with('address', () => ({
        icon: 'address',
        label: 'set address to',
        slots: [
          value && isAddress(value, { strict: false })
            ? addressSlot(value)
            : valueSlot(value),
        ],
      }))
      .with('contenthash', () => ({
        icon: 'contenthash',
        label: 'set content hash to',
        slots: [valueSlot(value)],
      }))
      // Any account can write any string as its `name()`: shown as text, never a link.
      .with('name', () =>
        value
          ? {
              icon: 'primary',
              label: 'set primary name to',
              slots: [valueSlot(value)],
            }
          : { icon: 'primary', label: 'set reverse name record', slots: [] },
      )
      .with('abi', () => ({ label: 'changed ABI', slots: [] }))
      .with('pubkey', () => ({ label: 'changed public key', slots: [] }))
      .with('interface', () => ({ label: 'set interface', slots: [] }))
      .with('other', () => ({
        label: 'set record',
        slots: [
          {
            kind: 'text',
            value: sanitizeOnChainText(primary.data?.key ?? '') || '—',
          },
        ],
      }))
      .exhaustive()
  )
}

const powerList = (powers: readonly Power[]): ActionSlot => ({
  kind: 'text',
  value: powers.map(formatPower).join(', '),
})

/** The grantee of a permission row, attributed to its transaction when known. */
const permissionAccount = (
  primary: TimelineEventOfType<'permission'>,
): ActionSlot => {
  const address = primary.data?.address
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
  roles: string,
): DescriptorResult | undefined => {
  if (!added || !removed) return undefined
  if (added.length > 0 && removed.length === 0)
    return {
      label: `granted ${roles}`,
      slots: [powerList(added), { kind: 'connective', value: 'to' }, account],
    }
  if (removed.length > 0 && added.length === 0)
    return {
      icon: 'revoke',
      label: `revoked ${roles}`,
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
  } = primary.data ?? {}
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
  if (isFuseChange({ powers, fuses }))
    return { icon: 'fuses', label: 'set fuses', slots: [] }
  // A change on a registry's root resource has no name: its
  // roles cover every name of the registry, so the row says "root" and names
  // the registry instead.
  const roles = scope?.kind === 'root' ? 'root roles' : 'roles'
  const registry = rootPermissionRegistry(scope)
  const onRegistry: ActionSlot[] = registry
    ? [
        { kind: 'connective', value: 'on' },
        contractSlot(registry, { isRegistry: true }),
      ]
    : []
  const diff = describePowerDiff(added, removed, account, roles)
  if (diff) return { ...diff, slots: [...diff.slots, ...onRegistry] }
  // `powers` is the subject's power set after the change; an empty set is
  // every role gone.
  if (!powers?.length)
    return {
      icon: 'revoke',
      label: `revoked ${roles} from`,
      slots: [account, ...onRegistry],
    }
  return {
    label: `set ${roles}`,
    slots: [
      powerList(powers),
      { kind: 'connective', value: 'for' },
      account,
      ...onRegistry,
    ],
  }
}

const MIGRATION_PATH_LABELS: Record<MigrationPath, string> = {
  unwrapped: 'unwrapped',
  unlocked_wrapped: 'wrapped',
  locked_wrapped: 'locked',
  locked_child: 'locked subname',
  emancipated_child: 'emancipated subname',
}

/**
 * What the name was in ENSv1 when it migrated, in words; undefined when the
 * row kept no path or carries one newer than this table.
 */
export const migrationPathLabel = (
  path: MigrationPath | undefined,
): string | undefined =>
  path && Object.hasOwn(MIGRATION_PATH_LABELS, path)
    ? MIGRATION_PATH_LABELS[path]
    : undefined

const describeMigration = (
  primary: TimelineEventOfType<'migration'>,
): DescriptorResult => {
  const path = migrationPathLabel(primary.data?.migration_path)
  return {
    label: 'migrated',
    slots: [
      nameSlot(primary.name),
      { kind: 'connective', value: 'to ENSv2' },
      ...(path ? [{ kind: 'connective' as const, value: `(${path})` }] : []),
    ],
  }
}

/**
 * A record link points a node at a shared record set (record id `"0"` unlinks);
 * it is neither a record write nor a resolver change.
 */
const describeResolver = (
  primary: TimelineEventOfType<'resolver'>,
): DescriptorResult =>
  match(primary.data ?? {})
    .returnType<DescriptorResult>()
    .with({ action: 'resolver_record_linked', record_id: '0' }, () => ({
      icon: 'records',
      label: 'unlinked shared records',
      slots: [],
    }))
    .with({ action: 'resolver_record_linked' }, ({ record_id }) => ({
      icon: 'records',
      label: 'linked shared records',
      slots: record_id ? [{ kind: 'text', value: `ID ${record_id}` }] : [],
    }))
    .with({ resolver: P.nonNullable }, ({ resolver }) => ({
      label: 'updated resolver to',
      slots: [contractSlot(resolver, { label: 'resolver' })],
    }))
    .otherwise(() => ({ label: 'cleared resolver', slots: [] }))

/**
 * bigname serves no row `name` here; the recorded name is `data.name`,
 * unverified and unnormalized, so it is text and only when it was set.
 */
const describePrimaryName = (
  primary: TimelineEventOfType<'primary_name'>,
): DescriptorResult => {
  const account = addressSlot(primary.data?.address)
  return match(primary.data ?? {})
    .returnType<DescriptorResult>()
    .with({ name_status: 'set', name: P.string }, ({ name }) => ({
      label: 'set primary name',
      slots: [valueSlot(name), { kind: 'glyph', value: '↔' }, account],
    }))
    .with({ name_status: 'cleared' }, () => ({
      icon: 'revoke',
      label: 'cleared primary name of',
      slots: [account],
    }))
    .with({ action: 'reverse_claimed' }, () => ({
      label: 'claimed reverse record for',
      slots: [account],
    }))
    .otherwise(() => ({ label: 'updated primary name of', slots: [account] }))
}

const describeContract = (
  primary: TimelineEventOfType<'contract'>,
): DescriptorResult => {
  const data = primary.data ?? {}
  const registry = contractSlot(data.registry, { isRegistry: true })
  return match(data.action)
    .returnType<DescriptorResult>()
    .with('registry_created', () => ({
      label: 'created registry',
      slots: [registry],
    }))
    .with('registry_parent_changed', () =>
      data.parent_cleared
        ? { label: 'cleared the parent of', slots: [registry] }
        : {
            label: 'set the parent of',
            slots: [
              registry,
              { kind: 'connective', value: 'to' },
              contractSlot(data.parent, { isRegistry: true }),
            ],
          },
    )
    .with('contract_upgraded', () => ({
      label: 'upgraded',
      slots: [
        contractSlot(data.proxy),
        { kind: 'connective', value: 'to' },
        contractSlot(data.implementation),
      ],
    }))
    .otherwise(() => ({
      label: humanizeType(primary.kind ?? primary.type).toLowerCase(),
      slots: [],
    }))
}

type Descriptors = {
  readonly [TType in EventType]: Descriptor<TimelineEventOfType<TType>>
}

/**
 * Labels are lowercase past-tense verb phrases: every row is rendered as
 * "{actor} {label} {slots}", with the transaction sender as its subject (see
 * `summarizeEvents`), so a label must read on from a name or an address.
 */
const DESCRIPTORS: Descriptors = {
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
      if (isZero(primary.data?.from)) return null
      return {
        label: 'transferred',
        slots: [
          nameSlot(primary.name),
          { kind: 'glyph', value: '→' },
          addressSlot(primary.data?.to),
        ],
      }
    },
  },
  authority: {
    icon: 'registry',
    build: (primary) =>
      match(primary)
        .returnType<DescriptorResult>()
        .with({ data: { action: 'name_wrapped' } }, () => ({
          label: 'wrapped',
          slots: [nameSlot(primary.name)],
        }))
        .with({ data: { action: 'name_unwrapped' } }, () => ({
          label: 'unwrapped',
          slots: [nameSlot(primary.name)],
        }))
        .with({ kind: 'AuthorityTransferred' }, () => ({
          label: 'set registry owner to',
          slots: [addressSlot(primary.data?.owner)],
        }))
        .otherwise(() => ({ label: 'updated authority', slots: [] })),
  },
  resolver: {
    icon: 'resolver',
    build: describeResolver,
  },
  record: {
    icon: 'records',
    build: describeRecord,
  },
  primary_name: {
    icon: 'primary',
    build: describePrimaryName,
  },
  permission: {
    icon: 'grant',
    build: describePermission,
  },
  subregistry: {
    icon: 'registry',
    build: (primary) =>
      primary.data?.subregistry
        ? {
            label: 'linked subregistry',
            slots: [
              contractSlot(primary.data?.subregistry, { isRegistry: true }),
            ],
          }
        : { label: 'unlinked subregistry', slots: [] },
  },
  migration: {
    icon: 'migrate',
    build: describeMigration,
  },
  reservation: {
    icon: 'register',
    build: (primary) => ({
      label:
        primary.data?.action === 'reservation_became_reachable'
          ? 'reservation became reachable'
          : 'reserved',
      slots: [
        nameSlot(primary.name),
        ...(primary.data?.action === 'registration_reserved'
          ? [{ kind: 'text' as const, value: 'for ENSv2' }]
          : []),
      ],
    }),
  },
  token: {
    icon: 'default',
    build: () => ({ label: 'regenerated token', slots: [] }),
  },
  contract: {
    icon: 'registry',
    build: describeContract,
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
