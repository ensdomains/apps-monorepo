import type { Address, Hex } from 'viem'
import type { TimelineEvent } from '../timelineEvent'

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
 * An inline piece of an action label. `name`/`address`/`contract`/`text` render
 * as `EntityBadge` pills; `glyph`/`connective` are muted joiners.
 */
export type ActionSlot =
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'address'; readonly value: Address }
  | {
      readonly kind: 'contract'
      readonly value: Address
      readonly isRegistry?: boolean
      readonly label?: string
    }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'glyph'; readonly value: '→' | '↔' }
  | { readonly kind: 'connective'; readonly value: string }
  | { readonly kind: 'placeholder'; readonly value: string }
  | {
      readonly kind: 'actor'
      readonly txHash: Hex
      readonly address?: Address
    }

/**
 * A tier-1 semantic action, produced by the summarize engine from history rows.
 * Actions are one-per-transaction; a row with no transaction (a lapse bigname
 * derives from state) is an action of its own. A row reads "{label} {slots}",
 * led by the transaction sender on feeds whose subject is not the actor (see
 * `ActionSummaryRow.showActor`).
 */
export type Action = {
  /** Stable identity: the transaction hash, or the row id for a state-derived row. */
  readonly id: string
  /** Absent for a state-derived row, which has no transaction to describe. */
  readonly txHash?: Hex
  readonly icon: ActionIcon
  /** The past-tense verb phrase, e.g. "set address to". */
  readonly label: string
  /** Entities/joiners rendered inline after the label. */
  readonly slots: readonly ActionSlot[]
  readonly timestamp: number
  /** Underlying history rows (tier-2). */
  readonly events: readonly TimelineEvent[]
}

export type DescriptorResult = {
  icon?: ActionIcon
  label: string
  slots: ActionSlot[]
}

/**
 * A descriptor turns a row into a label + slots. `null` = not applicable.
 * A build may override the type-level icon for conditional variants (grant vs revoke).
 */
export type Descriptor<TEvent extends TimelineEvent = TimelineEvent> = {
  readonly icon: ActionIcon
  readonly build: (primary: TEvent) => DescriptorResult | null
}
