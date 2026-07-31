import type { Hex } from 'viem'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'

/** Icon key for an action; mapped to a Lucide icon in `components/actionIcons.tsx`. */
export type ActionIcon =
  | 'address'
  | 'text'
  | 'records'
  | 'contenthash'
  | 'primary'
  | 'transfer'
  | 'subname'
  | 'register'
  | 'renew'
  | 'resolver'
  | 'registry'
  | 'grant'
  | 'revoke'
  | 'migrate'
  | 'fuses'
  | 'expiry'
  | 'default'

/**
 * An inline piece of an action label. `name`/`address`/`contract` render as
 * `EntityBadge` chips; `text` is monospace; `glyph`/`connective` are muted joiners;
 * `placeholder` marks data we don't have yet.
 */
export type ActionSlot =
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'address'; readonly value: string }
  | {
      readonly kind: 'contract'
      readonly value: string
      readonly isRegistry?: boolean
    }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'glyph'; readonly value: '→' | '↔' }
  | { readonly kind: 'connective'; readonly value: string }
  | { readonly kind: 'placeholder'; readonly value: string }
  | {
      readonly kind: 'actor'
      readonly txHash: Hex
      readonly address?: string
    }

/**
 * A tier-1 semantic action, produced by the summarize engine from raw events.
 * Actions are one-per-transaction, so `txHash` doubles as the stable identity.
 */
export type Action = {
  readonly txHash: Hex
  readonly icon: ActionIcon
  /** The verb phrase, e.g. "Set address to". */
  readonly label: string
  /** Entities/joiners rendered inline after the label. */
  readonly slots: readonly ActionSlot[]
  readonly timestamp: number
  /** Underlying on-chain events (tier-2). */
  readonly events: readonly TimelineIndexerEvent[]
}

/**
 * A descriptor turns an event into a label + slots. `null` = not applicable.
 * A build may override the type-level icon for conditional variants (grant vs revoke).
 */
export type Descriptor = {
  readonly icon: ActionIcon
  readonly build: (ctx: {
    primary: TimelineIndexerEvent
  }) => { icon?: ActionIcon; label: string; slots: ActionSlot[] } | null
}
