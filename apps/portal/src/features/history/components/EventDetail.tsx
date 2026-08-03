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
import {
  getContractLabel,
  getEnsContractName,
} from '@/utils/ens/ensContractNames'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import type {
  TimelineDecoded,
  TimelineIndexerEvent,
} from '../hooks/useNameHistoryTimeline'
import { parseEventData, resolveDecodedName } from '../summarize/decodeRawData'
import { AccountBadge, FullOnDesktop } from './AccountBadge'
import { getTimelineFieldType } from './eventFieldTypes'

const CONTRACT_PARAM_KEYS = new Set([
  'resolver',
  'registry',
  'subregistry',
  'implementer',
])

const PAYLOAD_KEY_BY_TYPE: Record<string, keyof TimelineDecoded> = {
  AddressChanged: 'asAddressChanged',
  AddrChanged: 'asAddressChanged',
  TextChanged: 'asTextChanged',
  Transfer: 'asTransfer',
  RegistryTransfer: 'asRegistryTransfer',
  LabelRegistered: 'asLabelRegistered',
  NameRegistered: 'asNameRegistered',
  NameRenewed: 'asNameRenewed',
  ResolverUpdated: 'asResolverUpdated',
  ReverseClaimed: 'asReverseClaimed',
  NameWrapped: 'asNameWrapped',
  NameUnwrapped: 'asNameUnwrapped',
  FusesSet: 'asFusesSet',
  ExpiryUpdated: 'asExpiryUpdated',
}

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
  const explorerUrl = useBlockExplorerAddressUrl(address)

  if (address && address !== zeroAddress) {
    const known = getContractLabel(address)
    const isRegistryParam =
      paramKey === 'registry' || paramKey === 'subregistry'
    if (known || CONTRACT_PARAM_KEYS.has(paramKey)) {
      return (
        <EntityBadge
          variant="contract"
          address={address}
          label={
            known ??
            (paramKey === 'resolver' ? 'resolver' : undefined) ??
            (isRegistryParam ? 'permissioned registry' : undefined)
          }
          isRegistry={isRegistryParam && !known}
          etherscanHref={explorerUrl}
          compact
        >
          <FullOnDesktop value={address} />
        </EntityBadge>
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
  const payloadKey = PAYLOAD_KEY_BY_TYPE[event.type]
  const source = (payloadKey && event[payloadKey]) || parseEventData(event.data)
  const entries = Object.entries(source)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, String(value)] as const)

  if (entries.length === 0) {
    return (
      <p className="py-2 text-muted-foreground text-sm">
        No decoded parameters for this event.
      </p>
    )
  }
  return (
    <div className="w-full overflow-x-auto overscroll-x-contain [contain:inline-size] sm:overflow-x-visible sm:[contain:none]">
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

  const txUrl = useBlockExplorerTxUrl(txHash)
  const toUrl = useBlockExplorerAddressUrl(toAddress)

  const fromValue = tx?.from ? <AccountBadge address={tx.from} full /> : pending
  const toValue = !toAddress ? (
    pending
  ) : getEnsContractName(toAddress) ||
    event.contractAddress?.toLowerCase() === toAddress.toLowerCase() ? (
    <EntityBadge
      variant="contract"
      address={toAddress}
      label={getContractLabel(toAddress)}
      etherscanHref={toUrl}
      compact
    >
      <FullOnDesktop value={toAddress} />
    </EntityBadge>
  ) : (
    <AccountBadge address={toAddress} full />
  )

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
