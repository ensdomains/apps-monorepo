import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { CopyButton } from '@/components/CopyButton'
import { EntityBadge, type EntityVariant } from '@/components/EntityBadge'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface AddressDisplayProps {
  address: Address
  short?: boolean
  variant?: EntityVariant
}

export const AddressDisplay = ({
  address,
  short = true,
  variant: variantProp = 'address',
}: AddressDisplayProps) => {
  const { data: ensName, isLoading } = useEnsName({ address })

  if (isLoading) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div className="w-5 h-5 rounded-sm [background:var(--avatar-placeholder-gradient)]" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  const displayName = ensName || (short ? truncateAddress(address) : address)
  const variant = ensName ? 'name' : variantProp

  const badge = <EntityBadge variant={variant}>{displayName}</EntityBadge>

  return (
    <div className="flex flex-row items-center gap-2">
      {ensName ? (
        <NameAvatar
          name={ensName}
          height="20px"
          width="20px"
          rounded="rounded-sm"
        />
      ) : (
        <div className="w-5 h-5 rounded-sm [background:var(--avatar-placeholder-gradient)]" />
      )}
      {ensName ? (
        <Link to="/$name" params={{ name: ensName }}>
          {badge}
        </Link>
      ) : (
        <Link to="/addr/$addr" params={{ addr: address }}>
          {badge}
        </Link>
      )}
      <CopyButton value={ensName || address} />
    </div>
  )
}
