import { Link } from '@tanstack/react-router'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
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
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(ensName || address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
      <Link to="/addr/$addr" params={{ addr: address }}>
        <EntityBadge variant={variant}>{displayName}</EntityBadge>
      </Link>
      <button
        type="button"
        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="size-3" />
        ) : (
          <CopyIcon className="size-3" />
        )}
      </button>
    </div>
  )
}
