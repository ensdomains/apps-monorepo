import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NameAvatar } from '../../profile/components/NameAvatar'

export type OwnerCardProps = {
  owner: {
    name?: string
    address: Address
  }
  label?: string
}

export function OwnerCard({ owner, label = 'Owner' }: OwnerCardProps) {
  const shortened = `${owner.address.slice(0, 6)}...${owner.address.slice(-4)}`
  const display = owner.name || shortened

  return (
    <Link
      to="/addr/$addr"
      params={{ addr: owner.address }}
      className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300 hover:bg-gray-100"
    >
      <NameAvatar width="40px" height="40px" name={display} />
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span>{display}</span>
      </div>
    </Link>
  )
}
