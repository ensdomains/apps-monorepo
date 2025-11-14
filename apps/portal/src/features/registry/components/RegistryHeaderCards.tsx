import type { Address } from 'viem'
import type { NetworkLocation } from './NetworkCard'
import { NetworkCard } from './NetworkCard'
import { OwnerCard } from './OwnerCard'

type RegistryHeaderCardsProps = {
  owner: {
    name?: string
    address: Address
  }
  network: {
    name: string
    location: NetworkLocation
  }
}

export function RegistryHeaderCards({
  owner,
  network,
}: RegistryHeaderCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <OwnerCard owner={owner} />
      <NetworkCard network={network} />
    </div>
  )
}
