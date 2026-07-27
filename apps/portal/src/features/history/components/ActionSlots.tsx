import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ActionSlot } from '../summarize/summarize.types'
import { AccountBadge } from './AccountBadge'

/** Renders one label slot — an entity chip, a monospace value, or a muted joiner. */
const Slot = ({ slot }: { slot: ActionSlot }) =>
  match(slot)
    .with({ kind: 'name' }, ({ value }) => (
      <EntityBadge variant="name" name={value} compact>
        {value}
      </EntityBadge>
    ))
    .with({ kind: 'address' }, ({ value }) => <AccountBadge address={value} />)
    .with({ kind: 'actor' }, ({ address, txHash }) => (
      <AccountBadge address={address} txHash={txHash} />
    ))
    .with({ kind: 'contract' }, ({ value, isRegistry }) => (
      <EntityBadge
        variant="contract"
        address={value as Address}
        isRegistry={isRegistry}
        compact
      >
        {truncateAddress(value)}
      </EntityBadge>
    ))
    .with({ kind: 'tx' }, ({ value }) => (
      <EntityBadge variant="tx" copyValue={value} compact>
        {truncateAddress(value)}
      </EntityBadge>
    ))
    .with({ kind: 'text' }, ({ value }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
        {value}
      </code>
    ))
    .with({ kind: 'glyph' }, ({ value }) => (
      <span className="text-muted-foreground">{value}</span>
    ))
    .with({ kind: 'connective' }, ({ value }) => (
      <span className="text-muted-foreground text-sm">{value}</span>
    ))
    .with({ kind: 'placeholder' }, ({ value }) => (
      <span className="rounded border border-dashed px-1.5 py-0.5 text-muted-foreground text-sm">
        {value}
      </span>
    ))
    .exhaustive()

export const ActionSlots = ({ slots }: { slots: readonly ActionSlot[] }) => (
  <>
    {slots.map((slot, index) => (
      <Slot
        key={`${slot.kind}-${
          // biome-ignore lint/suspicious/noArrayIndexKey: unique key for each slot
          index + 1
        }`}
        slot={slot}
      />
    ))}
  </>
)
