import type { Address, Hash } from 'viem'
import { isAddress } from 'viem'
import { useEnsName, useTransaction } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface AccountBadgeProps {
  /** The account address, when known. */
  readonly address?: Address
  /** When no address is known (the actor leading a row), resolve this tx's sender instead. */
  readonly txHash?: Hash
  readonly full?: boolean
  /**
   * Gate the network resolution (tx sender + reverse lookup). Defaults to
   * eager; pass an in-view signal to defer it on long, always-visible lists.
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
 * reachable through the Name chip. Optionally resolves the address from a
 * transaction's sender first. Kept here (not in EntityBadge) so the shared badge
 * stays presentational.
 *
 * TODO(indexer): once `Event.from` is indexed, pass it as `address` and drop the tx RPC.
 */
export const AccountBadge = ({
  address,
  txHash,
  full = false,
  enabled = true,
}: AccountBadgeProps) => {
  const needsTx = !!txHash && !address
  const { data: tx, error } = useTransaction({
    hash: txHash,
    query: { enabled: needsTx && enabled },
  })

  const resolved: Address | undefined =
    address ??
    (tx?.from && isAddress(tx.from, { strict: false }) ? tx.from : undefined)

  const { data: name } = useEnsName({
    address: resolved,
    query: { enabled: !!resolved && enabled },
  })
  const explorerUrl = useBlockExplorerAddressUrl(resolved)

  // Three unresolved states, told apart: the lookup failed, the lookup is
  // still to come (deferred off-screen or in flight), or the transaction has
  // no sender to show — only the last is the "no data" dash.
  if (!resolved) {
    if (error) {
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
    if (needsTx && !tx) {
      return (
        <span
          aria-busy
          className="inline-block h-6 w-28 animate-pulse rounded bg-muted"
        />
      )
    }
    return <span className="text-muted-foreground text-p">—</span>
  }

  return (
    <EntityBadge
      variant="address"
      address={resolved}
      name={name ?? undefined}
      etherscanHref={explorerUrl}
      compact
    >
      {name ??
        (full ? <FullOnDesktop value={resolved} /> : truncateAddress(resolved))}
    </EntityBadge>
  )
}
