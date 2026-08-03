import type { Address, Hash } from 'viem'
import { isAddress } from 'viem'
import { useEnsName, useTransaction } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface AccountBadgeProps {
  /** The account address, when known. */
  readonly address?: Address
  /** When no address is known (e.g. "Renew by …"), resolve this tx's sender instead. */
  readonly txHash?: Hash
  readonly full?: boolean
}

/** Full value on desktop, truncated on mobile — for hashes/addresses in expanded detail. */
export const FullOnDesktop = ({ value }: { value: string }) => (
  <>
    <span className="sm:hidden">{truncateAddress(value)}</span>
    <span className="hidden sm:inline">{value}</span>
  </>
)

/**
 * Renders an account as its **primary ENS name** (no avatar) when one resolves,
 * otherwise the truncated address. Optionally resolves the address from a transaction's
 * sender first. Kept here (not in EntityBadge) so the shared badge stays presentational.
 */
export const AccountBadge = ({
  address,
  txHash,
  full = false,
}: AccountBadgeProps) => {
  const needsTx = !!txHash && !address
  const { data: tx, isPending } = useTransaction({
    hash: txHash,
    query: { enabled: needsTx },
  })

  const resolved: Address | undefined =
    address ??
    (tx?.from && isAddress(tx.from, { strict: false }) ? tx.from : undefined)

  const { data: name } = useEnsName({
    address: resolved,
    query: { enabled: !!resolved },
  })
  const explorerUrl = useBlockExplorerAddressUrl(resolved)

  if (!resolved) {
    return (
      <span className="text-muted-foreground text-sm">
        {needsTx && isPending ? '…' : '—'}
      </span>
    )
  }

  if (name) {
    return (
      <EntityBadge
        variant="name"
        name={name}
        address={resolved}
        etherscanHref={explorerUrl}
        compact
      >
        {name}
      </EntityBadge>
    )
  }

  return (
    <EntityBadge
      variant="address"
      address={resolved}
      etherscanHref={explorerUrl}
      compact
    >
      {full ? <FullOnDesktop value={resolved} /> : truncateAddress(resolved)}
    </EntityBadge>
  )
}
