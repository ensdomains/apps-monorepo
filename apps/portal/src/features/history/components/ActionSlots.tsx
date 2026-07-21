import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ActionSlot } from '../summarize/summarize.types'

/** Renders one label slot — an entity chip, a monospace value, or a muted joiner. */
const Slot = ({ slot }: { slot: ActionSlot }) => {
  switch (slot.kind) {
    case 'name':
      return (
        <EntityBadge variant="name" name={slot.value}>
          {slot.value}
        </EntityBadge>
      )
    case 'address':
      return (
        <EntityBadge variant="address" address={slot.value as Address}>
          {truncateAddress(slot.value)}
        </EntityBadge>
      )
    case 'contract':
      return (
        <EntityBadge
          variant="contract"
          address={slot.value as Address}
          isRegistry={slot.isRegistry}
        >
          {truncateAddress(slot.value)}
        </EntityBadge>
      )
    case 'tx':
      return (
        <EntityBadge variant="tx" copyValue={slot.value}>
          {truncateAddress(slot.value)}
        </EntityBadge>
      )
    case 'text':
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          {slot.value}
        </code>
      )
    case 'glyph':
      return <span className="text-muted-foreground">{slot.value}</span>
    case 'connective':
      return <span className="text-muted-foreground text-sm">{slot.value}</span>
    case 'placeholder':
      return (
        <span className="rounded border border-dashed px-1.5 py-0.5 text-muted-foreground text-sm">
          {slot.value}
        </span>
      )
    default:
      return null
  }
}

export const ActionSlots = ({ slots }: { slots: readonly ActionSlot[] }) => (
  <>
    {slots.map((slot, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: slots are a positional, static label sequence
      <Slot key={index} slot={slot} />
    ))}
  </>
)
