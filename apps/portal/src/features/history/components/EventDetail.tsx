import { useQueries } from '@tanstack/react-query'
import {
  formatEther,
  formatGwei,
  type Hash,
  isAddress,
  zeroAddress,
} from 'viem'
import { useChainId, useConfig } from 'wagmi'
import {
  getTransactionQueryOptions,
  getTransactionReceiptQueryOptions,
} from 'wagmi/query'
import { EntityBadge } from '@/components/EntityBadge'
import {
  useBlockExplorerAddressUrl,
  useBlockExplorerTxUrl,
} from '@/utils/blockExplorer/useBlockExplorerUrl'
import { getEnsContractName } from '@/utils/ens/ensContractNames'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { resolveDecodedName } from '../summarize/decodeRawData'
import { AccountBadge, FullOnDesktop } from './AccountBadge'
import { getDecodedEntries } from './eventDecodedEntries'
import { getTimelineFieldType } from './eventFieldTypes'

/** Param keys that denote a contract even when the address is not a known ENS contract. */
const CONTRACT_PARAM_KEYS = new Set([
  'resolver',
  'registry',
  'subregistry',
  'implementer',
])

/**
 * One decoded value: entity-shaped values render as interactive EntityBadges —
 * addresses resolve to account badges (primary name when one exists), known ENS
 * contracts / resolver / registry params to contract badges, `name` params to name
 * badges — everything else stays plain monospace text.
 */
const DecodedValue = ({
  event,
  paramKey,
  value,
}: {
  event: TimelineIndexerEvent
  paramKey: string
  value: string
}) => {
  const chainId = useChainId()
  const address = isAddress(value, { strict: false }) ? value : undefined
  const explorerUrl = useBlockExplorerAddressUrl(address)

  if (address && address !== zeroAddress) {
    const isRegistryParam =
      paramKey === 'registry' || paramKey === 'subregistry'
    const knownContract = !!getEnsContractName(chainId, address)
    if (knownContract || CONTRACT_PARAM_KEYS.has(paramKey)) {
      return (
        <EntityBadge
          variant="contract"
          address={address}
          isRegistry={isRegistryParam}
          etherscanHref={explorerUrl}
          compact
        >
          <FullOnDesktop value={address} />
        </EntityBadge>
      )
    }
    return <AccountBadge address={address} full />
  }

  // Only `name` params carry display labels — `label` params are bytes32 labelhashes.
  const name =
    paramKey === 'name' ? resolveDecodedName(value, event.name) : undefined
  if (name) {
    return (
      <EntityBadge variant="name" name={name} compact>
        {name}
      </EntityBadge>
    )
  }

  return <>{value}</>
}

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
      <table className="w-full border-separate border-spacing-y-2 text-sm">
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
                {getTimelineFieldType(event.type, key)}
              </td>
              <td className="py-1.5 break-all align-top font-mono">
                <DecodedValue event={event} paramKey={key} value={value} />
              </td>
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
    <span className="w-24 shrink-0 text-muted-foreground text-sm sm:w-40">
      {label}
    </span>
    <span className="font-mono text-sm min-w-0">{children}</span>
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
  const chainId = useChainId()
  const config = useConfig()
  const [txQuery, receiptQuery] = useQueries({
    queries: [
      getTransactionQueryOptions(config, { hash: txHash, chainId }),
      getTransactionReceiptQueryOptions(config, { hash: txHash, chainId }),
    ],
  })
  const tx = txQuery.data
  const receipt = receiptQuery.data

  const pending = txQuery.isLoading || receiptQuery.isLoading ? '…' : '—'
  const toAddress = tx?.to ?? event.contractAddress ?? undefined
  const toIsKnownContract = toAddress
    ? !!getEnsContractName(chainId, toAddress)
    : false

  const txUrl = useBlockExplorerTxUrl(txHash)
  const toUrl = useBlockExplorerAddressUrl(toAddress)

  const fromValue = tx?.from ? <AccountBadge address={tx.from} full /> : pending
  const toValue = toAddress ? (
    toIsKnownContract ? (
      <EntityBadge
        variant="contract"
        address={toAddress}
        etherscanHref={toUrl}
        compact
      >
        <FullOnDesktop value={toAddress} />
      </EntityBadge>
    ) : (
      <AccountBadge address={toAddress} full />
    )
  ) : (
    pending
  )

  return (
    <div className="flex flex-col gap-y-2">
      <MetaRow label="Transaction">
        <EntityBadge
          variant="tx"
          copyValue={txHash}
          etherscanHref={txUrl}
          compact
        >
          <FullOnDesktop value={txHash} />
        </EntityBadge>
      </MetaRow>
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
