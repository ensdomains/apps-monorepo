import { type Address, formatEther, formatGwei, type Hash } from 'viem'
import { useTransaction, useTransactionReceipt } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { getEventFieldType } from '@/utils/ens/eventSignatures'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { AccountBadge } from './AccountBadge'
import { getDecodedEntries } from './eventDecodedEntries'

/** Tier-3 decoded-parameter table (Parameter / Type / Decoded) — inline, no card. */
export const DecodedParams = ({ event }: { event: TimelineIndexerEvent }) => {
  const entries = getDecodedEntries(event)
  if (entries.length === 0) {
    return (
      <p className="py-2 text-muted-foreground text-sm">
        No decoded parameters for this event.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wide">
            <th className="py-1.5 pr-6 font-medium">Parameter</th>
            <th className="py-1.5 pr-6 font-medium">Type</th>
            <th className="py-1.5 font-medium">Decoded</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="py-1.5 pr-6 align-top font-mono">{key}</td>
              <td className="py-1.5 pr-6 align-top font-mono text-muted-foreground">
                {getEventFieldType(event.type, key)}
              </td>
              <td className="py-1.5 break-all align-top font-mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const MetaRow = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="flex items-baseline gap-4 py-1">
    <span className="w-40 shrink-0 text-muted-foreground text-sm">{label}</span>
    <span className="min-w-0 break-all font-mono text-sm">{children}</span>
  </div>
)

/**
 * Tier-3 transaction metadata — inline key/value list. Fetched lazily from the RPC
 * when opened; the indexer does not carry from/to/value/gas.
 *
 * TODO(indexer): if these become filterable requirements, index value + gas to drop
 * the per-open RPC calls.
 */
export const TransactionMeta = ({
  event,
  txHash,
}: {
  event: TimelineIndexerEvent
  txHash: Hash
}) => {
  const { data: tx, isLoading: isTxLoading } = useTransaction({ hash: txHash })
  const { data: receipt, isLoading: isReceiptLoading } = useTransactionReceipt({
    hash: txHash,
  })

  const pending = isTxLoading || isReceiptLoading ? '…' : '—'
  const toAddress = tx?.to ?? event.contractAddress ?? undefined

  const fromValue = tx?.from ? <AccountBadge address={tx.from} /> : pending
  const toValue = toAddress ? (
    <EntityBadge variant="contract" address={toAddress as Address}>
      {truncateAddress(toAddress)}
    </EntityBadge>
  ) : (
    pending
  )

  return (
    <div className="flex flex-col">
      <MetaRow label="Transaction">{txHash}</MetaRow>
      <MetaRow label="Block">{event.blockNumber}</MetaRow>
      <MetaRow label="Timestamp">
        {formatTimestamp(BigInt(event.timestamp)) ?? '—'} UTC
      </MetaRow>
      <MetaRow label="From">{fromValue}</MetaRow>
      <MetaRow label="To">{toValue}</MetaRow>
      <MetaRow label="Value">
        {tx ? `${formatEther(tx.value)} ETH` : pending}
      </MetaRow>
      <MetaRow label="Gas used">
        {receipt ? receipt.gasUsed.toString() : pending}
      </MetaRow>
      <MetaRow label="Gas price">
        {receipt?.effectiveGasPrice
          ? `${formatGwei(receipt.effectiveGasPrice)} gwei`
          : pending}
      </MetaRow>
    </div>
  )
}
