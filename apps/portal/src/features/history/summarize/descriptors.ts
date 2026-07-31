import { zeroAddress } from 'viem'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import {
  decodeRoleChange,
  parseEventData,
  readString,
  resolveDecodedName,
} from './decodeRawData'
import type {
  ActionSlot,
  Descriptor,
  DescriptorContext,
} from './summarize.types'

const isZero = (value?: string | null): boolean =>
  !value || value.toLowerCase() === zeroAddress

const humanizeRole = (role: string): string =>
  role.endsWith('_ADMIN')
    ? `${formatRoleLabel(role)} Admin`
    : formatRoleLabel(role)

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

/**
 * Actor slot for actions like "Register by {actor}". Prefers a payload address;
 * otherwise carries the txHash so EntityBadge (senderOfTxHash + resolveName) resolves
 * the sender (and its primary name) at render time — no more `—` placeholder.
 *
 * TODO(indexer): pass `Event.from` here so no RPC lookup is needed.
 */
const actorSlot = (
  ctx: DescriptorContext,
  ...payloadCandidates: (string | null | undefined)[]
): ActionSlot => {
  const fromPayload = payloadCandidates.find((v) => v && !isZero(v))
  return {
    kind: 'actor',
    txHash: ctx.primary.transactionHash,
    address: fromPayload ?? undefined,
  }
}

const nameSlot = (value?: string | null): ActionSlot =>
  value ? { kind: 'name', value } : { kind: 'placeholder', value: '—' }

const addressSlot = (value?: string | null): ActionSlot =>
  value ? { kind: 'address', value } : { kind: 'placeholder', value: '—' }

const contractSlot = (
  value?: string | null,
  options?: { readonly isRegistry?: boolean; readonly label?: string },
): ActionSlot => {
  if (!value) return { kind: 'placeholder', value: '—' }
  return {
    kind: 'contract',
    value,
    ...(options?.isRegistry ? { isRegistry: true } : {}),
    ...(options?.label ? { label: options.label } : {}),
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

const primaryNameAction = (
  name: string | null | undefined,
  address: string | null | undefined,
) => ({
  icon: 'primary' as const,
  label: 'Set primary name',
  slots: [
    nameSlot(name),
    { kind: 'glyph' as const, value: '↔' as const },
    addressSlot(address),
  ],
})

export const DESCRIPTORS: Record<string, Descriptor> = {
  AddressChanged: {
    icon: 'address',
    build: ({ primary }) => ({
      label: 'Set address to',
      slots: [addressSlot(primary.asAddressChanged?.address)],
    }),
  },
  AddrChanged: {
    icon: 'address',
    build: ({ primary }) => ({
      label: 'Set address to',
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
    build: ({ primary }) => {
      const key = primary.asTextChanged?.key ?? primary.key ?? '—'
      const value = primary.asTextChanged?.value ?? primary.value ?? ''
      const slots: ActionSlot[] = [{ kind: 'text', value: key }]
      if (value) {
        slots.push({ kind: 'glyph', value: '→' }, { kind: 'text', value })
      }
      return { label: 'Set text record', slots }
    },
  },

  // No typed decoder — read from raw `data`. TODO(indexer): asContenthashChanged.
  ContenthashChanged: {
    icon: 'contenthash',
    build: ({ primary }) => {
      const hash = readString(
        parseEventData(primary.data),
        'hash',
        'contentHash',
      )
      return {
        label: 'Set content hash',
        slots: [
          {
            kind: 'text',
            value: hash ? truncateAddress(hash, 6, 4, '…') : '—',
          },
        ],
      }
    },
  },

  // Reverse-registrar primary-name set. TODO(indexer): asNameChanged.
  NameChanged: {
    icon: 'primary',
    build: ({ primary }) => {
      const setName =
        readString(parseEventData(primary.data), 'name') ?? primary.name
      // Address is on the reverse node — show name alone until indexer links it.
      return {
        label: 'Set primary name',
        slots: [nameSlot(setName)],
      }
    },
  },
  ReverseClaimed: {
    icon: 'primary',
    build: ({ primary }) =>
      primaryNameAction(primary.name, primary.asReverseClaimed?.address),
  },

  Transfer: {
    icon: 'transfer',
    build: ({ primary }) => {
      if (isZero(primary.asTransfer?.from)) return null
      return {
        label: 'Transfer name',
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
    build: ({ primary }) => ({
      label: 'Transfer name',
      slots: [
        nameSlot(primary.name),
        { kind: 'glyph', value: '→' },
        addressSlot(primary.asRegistryTransfer?.owner),
      ],
    }),
  },

  LabelRegistered: {
    icon: 'subname',
    build: ({ primary }) => ({
      label: 'Register subname',
      slots: [resolvedNameSlot(primary.asLabelRegistered?.name, primary.name)],
    }),
  },
  NameRegistered: {
    icon: 'register',
    build: ({ primary }) => ({
      label: 'Register name',
      slots: [resolvedNameSlot(primary.asNameRegistered?.name, primary.name)],
    }),
  },
  NameRenewed: {
    icon: 'renew',
    build: (ctx) => ({
      label: 'Renew',
      slots: [{ kind: 'connective', value: 'by' }, actorSlot(ctx)],
    }),
  },

  ResolverUpdated: {
    icon: 'resolver',
    build: ({ primary }) => ({
      label: 'Update resolver',
      slots: [contractSlot(primary.asResolverUpdated?.resolver)],
    }),
  },

  // Conditional variant: linking a real registry vs clearing it. TODO(indexer): typed decoder.
  SubregistryUpdated: {
    icon: 'registry',
    build: ({ primary }) => {
      const registry = readString(
        parseEventData(primary.data),
        'registry',
        'subregistry',
      )
      if (isZero(registry)) {
        return { label: 'Unlink subregistry', slots: [] }
      }
      return {
        label: 'Deploy and link subregistry',
        slots: [contractSlot(registry, { isRegistry: true })],
      }
    },
  },

  EACRolesChanged: {
    icon: 'grant',
    build: ({ primary }) => {
      const change = decodeRoleChange(primary.data)
      const roleText = change.roles.map(humanizeRole).join(', ') || 'roles'
      // Prefer actor so the account resolves to a primary-name badge when one exists (Figma).
      const account: ActionSlot = change.account
        ? {
            kind: 'actor',
            txHash: primary.transactionHash,
            address: change.account,
          }
        : { kind: 'placeholder', value: '—' }

      if (change.direction === 'revoke') {
        return {
          icon: 'revoke',
          label: 'Revoke role',
          slots: [
            { kind: 'text', value: roleText },
            { kind: 'connective', value: 'from' },
            account,
          ],
        }
      }
      if (change.direction === 'grant') {
        return {
          label: 'Grant role',
          slots: [
            { kind: 'text', value: roleText },
            { kind: 'connective', value: 'to' },
            account,
          ],
        }
      }
      return {
        label: 'Update roles',
        slots: [{ kind: 'text', value: roleText }],
      }
    },
  },

  NameWrapped: {
    icon: 'migrate',
    build: () => ({ label: 'Migrated to ENSv2', slots: [] }),
  },
  NameUnwrapped: {
    icon: 'migrate',
    build: () => ({ label: 'Unwrapped from ENSv2', slots: [] }),
  },
  FusesSet: {
    icon: 'fuses',
    build: () => ({ label: 'Set fuses', slots: [] }),
  },
  ExpiryUpdated: {
    icon: 'expiry',
    build: () => ({ label: 'Expiry updated', slots: [] }),
  },
}

export const FALLBACK_ICON = 'default' as const
