import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { Owner } from '@/components/primary-name/Owner'
import { NameAvatar } from '../../profile/components/NameAvatar'
import type { NameChainLocation } from './NetworkCard'
import { NetworkCard } from './NetworkCard'

type ParentRegistrySectionProps = {
  parent: {
    name: string
    address: Address
  }
  owner: {
    name?: string
    address: Address
  }
  network: NameChainLocation
}

export function ParentRegistrySection({
  parent,
  owner,
  network,
}: ParentRegistrySectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Parent registry</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/$name"
          params={{ name: parent.name }}
          className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300 hover:bg-gray-100"
        >
          <NameAvatar width="40px" height="40px" name={parent.name} />
          <div className="flex flex-col">
            <span className="font-medium">Parent</span>
            <span>{parent.name}</span>
          </div>
        </Link>

        <Owner owner={owner.address} />
        <NetworkCard network={network} />
      </div>
    </div>
  )
}
