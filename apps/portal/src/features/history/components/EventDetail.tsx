import { match, P } from 'ts-pattern'
import {
  type Address,
  formatEther,
  formatGwei,
  type Hash,
  isAddress,
  zeroAddress,
} from 'viem'
import { useTransaction, useTransactionReceipt } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import {
  getContractLabel,
  getEnsContractName,
} from '@/utils/ens/ensContractNames'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { resolveDecodedName } from '../summarize/decodeRawData'
import { AccountBadge, FullOnDesktop } from './AccountBadge'
import { ContractBadge } from './ContractBadge'
import { getDecodedParamEntries, getTimelineFieldType } from './eventFieldTypes'

const CONTRACT_PARAM_KEYS = new Set([
  'resolver',
  'registry',
  'subregistry',
  'implementer',
])

const DecodedValue = ({
  event,
  paramKey,
  value,
}: {
  event: TimelineIndexerEvent
  paramKey: string
  value: string
}) => {
  const address = isAddress(value, { strict: false }) ? value : undefined

  if (address && address !== zeroAddress) {
    const isRegistryParam =
      paramKey === 'registry' || paramKey === 'subregistry'
    if (getContractLabel(address) || CONTRACT_PARAM_KEYS.has(paramKey)) {
      return (
        <ContractBadge
          address={address}
          label={match(paramKey)
            .with('resolver', () => 'resolver')
            .with(
              P.union('registry', 'subregistry'),
              () => 'permissioned registry',
            )
            .otherwise(() => undefined)}
          isRegistry={isRegistryParam}
          full
        />
      )
    }
    return <AccountBadge address={address} full />
  }

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
  const entries = getDecodedParamEntries(event)

  if (entries.length === 0) {
    return (
      <p className="py-2 text-muted-foreground text-sm">
        No decoded parameters for this event.
      </p>
    )
  }
  return (
    <div className="w-full overflow-x-auto overscroll-x-contain contain-[inline-size] sm:overflow-x-visible sm:[contain:none]">
      <table className="w-max min-w-full border-separate border-spacing-y-2 text-sm sm:w-full">
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
              <td className="py-1.5 pr-6 align-top">
                <EntityBadge variant="default">{key}</EntityBadge>
              </td>
              <td className="py-1.5 pr-6 align-top font-mono text-muted-foreground">
                {getTimelineFieldType(event.type, key)}
              </td>
              <td className="py-1.5 break-all align-top font-mono text-neutral-7">
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
  <div className="flex items-baseline gap-4 py-1 text-muted-foreground">
    <span className="w-24 shrink-0 text-sm sm:w-40">{label}</span>
    <span className="shrink-0 font-mono text-sm sm:min-w-0 sm:shrink">
      {children}
    </span>
  </div>
)

export const TransactionMeta = ({
  event,
  txHash,
}: {
  event: TimelineIndexerEvent
  txHash: Hash
}) => {
  const { data: tx, isLoading: isTxLoading } = useTransaction({
    hash: txHash,
  })
  const { data: receipt, isLoading: isReceiptLoading } = useTransactionReceipt({
    hash: txHash,
  })

  const pending = isTxLoading || isReceiptLoading ? '…' : '—'
  const toAddress = tx?.to ?? event.contractAddress ?? undefined

  const txUrl = useBlockExplorerTxUrl(txHash)

  const fromValue = tx?.from ? <AccountBadge address={tx.from} full /> : pending
  const toValue = match(toAddress)
    .with(P.nullish, () => pending)
    .with(
      P.when(
        (addr: Address) =>
          !!getEnsContractName(addr) ||
          event.contractAddress?.toLowerCase() === addr.toLowerCase(),
      ),
      (addr) => <ContractBadge address={addr} full />,
    )
    .otherwise((addr) => <AccountBadge address={addr} full />)

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain [contain:inline-size] sm:overflow-x-visible sm:[contain:none]">
      <div className="flex w-max min-w-full flex-col gap-y-2 sm:w-full">
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
        {tx?.value !== 0n && (
          <MetaRow label="Value">
            {tx ? `${formatEther(tx.value)} ETH` : pending}
          </MetaRow>
        )}
        <MetaRow label="Gas used">
          {receipt ? receipt.gasUsed.toString() : pending}
        </MetaRow>
        <MetaRow label="Gas price">
          {receipt?.effectiveGasPrice
            ? `${formatGwei(receipt.effectiveGasPrice)} gwei`
            : pending}
        </MetaRow>
      </div>
    </div>
  )
}
