import type { Address, Hash } from 'viem'
import { useEnsName } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface AccountBadgeProps {
  /** The account address, when known. */
  readonly address?: Address
  readonly full?: boolean
  /**
   * Gate the reverse lookup. Defaults to eager; pass an in-view signal to defer
   * it on long, always-visible lists.
   */
  readonly enabled?: boolean
}

/** Full value on desktop, truncated on mobile — for hashes/addresses in expanded detail. */
export const FullOnDesktop = ({ value }: { value: string }) => (
  <>
    <span className="@2xl/timeline:hidden">{truncateAddress(value)}</span>
    <span className="hidden @2xl/timeline:inline">{value}</span>
  </>
)

/**
 * Renders an account as its **primary ENS name** (no avatar) when one resolves,
 * otherwise the truncated address. Either way the pill is the wallet — it links
 * to the address page, where its registry roles show — and a resolved name is
 * reachable through the Name chip. Kept here (not in EntityBadge) so the shared
 * badge stays presentational.
 */
export const AccountBadge = ({
  address,
  full = false,
  enabled = true,
}: AccountBadgeProps) => {
  const { data: name } = useEnsName({
    address,
    query: { enabled: !!address && enabled },
  })
  const explorerUrl = useBlockExplorerAddressUrl(address)

  if (!address) return <span className="text-muted-foreground text-p">—</span>

  return (
    <EntityBadge
      variant="address"
      address={address}
      name={name ?? undefined}
      etherscanHref={explorerUrl}
      compact
    >
      {name ??
        (full ? <FullOnDesktop value={address} /> : truncateAddress(address))}
    </EntityBadge>
  )
}

/**
 * The senders of a page's transactions, looked up once per page (see
 * `ActionTimeline`) rather than once per row. Shaped as the query result so a
 * consumer can tell a lookup still in flight from one that failed.
 *
 * TODO(indexer): once `Event.from` is indexed, read the sender off the event
 * and drop the lookup.
 */
export interface TransactionSenders {
  readonly data: ReadonlyMap<Hash, Address> | undefined
  readonly error: unknown
}

interface TransactionSenderBadgeProps {
  readonly txHash: Hash
  readonly senders: TransactionSenders
  readonly enabled?: boolean
}

/**
 * The account that sent a transaction, as an `AccountBadge`. Three unresolved
 * states are told apart: the lookup failed, the lookup is still in flight, or
 * the page's lookup has no sender for this transaction — only the last is the
 * "no data" dash.
 */
export const TransactionSenderBadge = ({
  txHash,
  senders,
  enabled = true,
}: TransactionSenderBadgeProps) => {
  const address = senders.data?.get(txHash)
  if (address) return <AccountBadge address={address} enabled={enabled} />

  if (senders.error) {
    return (
      <span
        className="text-muted-foreground text-p"
        title="Couldn't load the transaction sender"
      >
        unknown sender
      </span>
    )
  }
  // A span, not the `Skeleton` div: this sits inside inline row text.
  if (!senders.data) {
    return (
      <span
        aria-busy
        className="inline-block h-6 w-28 animate-pulse rounded bg-muted"
      />
    )
  }
  return <span className="text-muted-foreground text-p">—</span>
}
