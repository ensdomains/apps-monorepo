import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { decodeRoleChange, parseEventData, readString } from './decodeRawData'
import type {
  ActionSlot,
  Descriptor,
  DescriptorContext,
} from './summarize.types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const isZero = (value?: string | null): boolean =>
  !value || value.toLowerCase() === ZERO_ADDRESS

const short = (value?: string | null): string =>
  value ? truncateAddress(value, 6, 4, '…') : '—'

/** Prettify a role constant like `ROLE_SET_SUBREGISTRY` → "Set subregistry". */
const humanizeRole = (role: string): string => {
  const words = role
    .replace(/^ROLE_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fallback label for an unknown event type: `SubregistryUpdated` → "Subregistry updated". */
export const humanizeType = (type: string): string => {
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

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

const nameSlot = (value?: string | null): ActionSlot => ({
  kind: 'name',
  value: value ?? '—',
})

/**
 * The action catalogue. Keyed by the indexer `Event.type`.
 * A descriptor may inspect the payload to choose a conditional variant
 * (link vs unlink, grant vs revoke) — see the spec §4.
 */
export const DESCRIPTORS: Record<string, Descriptor> = {
  AddressChanged: {
    icon: 'address',
    build: ({ primary }) => ({
      label: 'Set address to',
      slots: [
        { kind: 'address', value: primary.asAddressChanged?.address ?? '—' },
      ],
    }),
  },
  AddrChanged: {
    icon: 'address',
    build: ({ primary }) => ({
      label: 'Set address to',
      slots: [
        {
          kind: 'address',
          value:
            primary.asAddressChanged?.address ??
            readString(parseEventData(primary.data), 'address', 'addr') ??
            '—',
        },
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
    build: ({ primary }) => ({
      label: 'Set content hash',
      slots: [
        {
          kind: 'text',
          value: short(
            readString(parseEventData(primary.data), 'hash', 'contentHash'),
          ),
        },
      ],
    }),
  },

  // Reverse-registrar primary-name set. TODO(indexer): asNameChanged.
  NameChanged: {
    icon: 'primary',
    build: ({ primary }) => ({
      label: 'Set primary name',
      slots: [nameSlot(readString(parseEventData(primary.data), 'name'))],
    }),
  },
  ReverseClaimed: {
    icon: 'primary',
    build: ({ primary }) => ({
      label: 'Set primary name',
      slots: [
        { kind: 'address', value: primary.asReverseClaimed?.address ?? '—' },
      ],
    }),
  },

  Transfer: {
    icon: 'transfer',
    build: ({ primary }) => {
      const to = primary.asTransfer?.to
      // from == 0 is a mint (registration) — let the register descriptor own that story.
      if (isZero(primary.asTransfer?.from)) return null
      return {
        label: 'Transfer name',
        slots: [
          nameSlot(primary.name),
          { kind: 'glyph', value: '→' },
          { kind: 'address', value: to ?? '—' },
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
        { kind: 'address', value: primary.asRegistryTransfer?.owner ?? '—' },
      ],
    }),
  },

  LabelRegistered: {
    icon: 'subname',
    build: ({ primary }) => ({
      label: 'Register subname',
      slots: [nameSlot(primary.asLabelRegistered?.name ?? primary.name)],
    }),
  },
  NameRegistered: {
    icon: 'register',
    build: (ctx) => ({
      label: 'Register',
      slots: [
        nameSlot(ctx.primary.asNameRegistered?.name ?? ctx.primary.name),
        { kind: 'connective', value: 'by' },
        actorSlot(ctx, ctx.primary.asNameRegistered?.owner),
      ],
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
      slots: [
        { kind: 'contract', value: primary.asResolverUpdated?.resolver ?? '—' },
      ],
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
        slots: [{ kind: 'contract', value: registry ?? '—', isRegistry: true }],
      }
    },
  },

  // Conditional variant: grant vs revoke from the bitmap delta.
  EACRolesChanged: {
    icon: 'grant',
    build: ({ primary }) => {
      const change = decodeRoleChange(primary.data)
      const roleText = change.roles.map(humanizeRole).join(', ') || 'roles'
      const account: ActionSlot = change.account
        ? { kind: 'address', value: change.account }
        : { kind: 'placeholder', value: '—' }

      if (change.direction === 'revoke') {
        return {
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

/**
 * Gapped actions from the design that the indexer does not (yet) emit as events.
 * Present for completeness; never rendered until the indexer supports them.
 *
 * TODO(indexer): confirm/emit TokenObserverSet and Burn events, then move these into
 * DESCRIPTORS and drop this list.
 */
export const UNSUPPORTED_ACTIONS = ['TokenObserverSet', 'Burn'] as const

/** Icon fallback used when no descriptor matches. */
export const FALLBACK_ICON = 'default' as const
