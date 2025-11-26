import type { Address } from 'viem'
import { Owner } from '@/components/primary-name/Owner'
import type { EnsNetworkName } from '@/utils/types'
import { NetworkCard } from './NetworkCard'

type RegistryHeaderCardsProps = {
  owner: {
    name?: string
    address: Address
  }
  network: {
    name: string
    location: EnsNetworkName
  }
}

export function RegistryHeaderCards({
  owner,
  network,
}: RegistryHeaderCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Owner owner={owner.address} />
      <NetworkCard network={network} />
    </div>
  )
}
