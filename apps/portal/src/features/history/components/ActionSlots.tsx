import { useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address, Hex } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ActionSlot } from '../summarize/summarize.types'
import {
  AccountBadge,
  TransactionSenderBadge,
  type TransactionSenders,
} from './AccountBadge'
import { ContractBadge } from './ContractBadge'

/**
 * Actor slots sit on always-visible tier-1 rows, so their reverse lookups would
 * all fire on page load. Defer each until its row scrolls near the viewport.
 * Falls back to eager where IntersectionObserver is absent (SSR/tests). The
 * sender lookup itself is not deferred: it is one batched request per page,
 * made in `ActionTimeline` and read through `senders`.
 */
const ActorSlot = ({
  address,
  txHash,
  senders,
}: {
  readonly address?: Address
  readonly txHash: Hex
  readonly senders: TransactionSenders
}) => {
  const ref = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(
    typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView])

  return (
    <span ref={ref} className="inline-flex">
      {address ? (
        <AccountBadge address={address} enabled={inView} />
      ) : (
        <TransactionSenderBadge
          txHash={txHash}
          senders={senders}
          enabled={inView}
        />
      )}
    </span>
  )
}

/**
 * Renders one label slot — an entity chip, a monospace value, or a muted joiner.
 * A joiner tucks under the padding of the chip before it; the first slot follows
 * the plain-text label instead, which has none to tuck under.
 */
const Slot = ({
  slot,
  isFirst,
  senders,
}: {
  readonly slot: ActionSlot
  readonly isFirst: boolean
  readonly senders: TransactionSenders
}) =>
  match(slot)
    .with({ kind: 'name' }, ({ value }) => (
      <EntityBadge variant="name" name={value} compact>
        {value}
      </EntityBadge>
    ))
    .with({ kind: 'address' }, ({ value }) => (
      <EntityBadge variant="address" address={value} compact>
        {truncateAddress(value)}
      </EntityBadge>
    ))
    .with({ kind: 'actor' }, ({ address, txHash }) => (
      <ActorSlot address={address} txHash={txHash} senders={senders} />
    ))
    .with({ kind: 'contract' }, ({ value, isRegistry, label }) => (
      <ContractBadge address={value} isRegistry={isRegistry} label={label} />
    ))
    .with({ kind: 'text' }, ({ value }) => (
      <code className="inline-block max-w-60 truncate rounded bg-neutral-1 px-1.5 py-0.5 align-bottom font-mono text-p text-neutral-7">
        {value}
      </code>
    ))
    .with({ kind: 'glyph' }, ({ value }) => (
      <span className="text-muted-foreground">{value}</span>
    ))
    .with({ kind: 'connective' }, ({ value }) => (
      <span className={cn('text-muted-foreground text-p', !isFirst && '-ml-2')}>
        {value}
      </span>
    ))
    .with({ kind: 'placeholder' }, ({ value }) => (
      <span className="rounded border border-dashed px-1.5 py-0.5 text-muted-foreground text-p">
        {value}
      </span>
    ))
    .exhaustive()

export const ActionSlots = ({
  slots,
  senders,
}: {
  readonly slots: readonly ActionSlot[]
  /** The page's batched tx-sender lookup, for actor slots with no address. */
  readonly senders: TransactionSenders
}) => (
  <>
    {slots.map((slot, index) => (
      <Slot
        // biome-ignore lint/suspicious/noArrayIndexKey: slots are a positional, static label sequence
        key={`${slot.kind}-${index}`}
        slot={slot}
        isFirst={index === 0}
        senders={senders}
      />
    ))}
  </>
)
