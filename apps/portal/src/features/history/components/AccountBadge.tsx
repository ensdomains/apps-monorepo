import type { Address, Hash } from 'viem'
import { useEnsName, useTransaction } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface AccountBadgeProps {
  /** The account address, when known. */
  readonly address?: string
  /** When no address is known (e.g. "Renew by …"), resolve this tx's sender instead. */
  readonly txHash?: string
}

/**
 * Renders an account as its **primary ENS name** (no avatar) when one resolves,
 * otherwise the truncated address. Optionally resolves the address from a transaction's
 * sender first. Kept here (not in EntityBadge) so the shared badge stays presentational.
 *
 * TODO(indexer): once `Event.from` is indexed, pass it as `address` and drop the tx RPC.
 */
export const AccountBadge = ({ address, txHash }: AccountBadgeProps) => {
  const { data: tx } = useTransaction({
    hash: txHash as Hash | undefined,
    query: { enabled: !!txHash && !address },
  })

  const resolved = (address ?? tx?.from) as Address | undefined

  const { data: name } = useEnsName({
    address: resolved,
    query: { enabled: !!resolved },
  })

  if (!resolved) {
    return <span className="text-muted-foreground text-sm">…</span>
  }

  if (name) {
    return (
      <EntityBadge variant="name" name={name} address={resolved}>
        {name}
      </EntityBadge>
    )
  }

  return (
    <EntityBadge variant="address" address={resolved}>
      {truncateAddress(resolved)}
    </EntityBadge>
  )
}
