import type { Address } from 'viem'
import { Owner } from '@/components/primary-name/Owner'
import type { EnsNetworkName } from '@/utils/types'
import { LabelCard } from './LabelCard'
import type { NameChainLocation } from './NetworkCard'
import { NetworkCard } from './NetworkCard'

type RegistryCardsGridProps = {
  label: string
  owner: {
    name?: string
    address: Address
  }
  network:
    | NameChainLocation
    | {
        name: string
        location: EnsNetworkName
      }
}

export function RegistryCardsGrid({
  label,
  owner,
  network,
}: RegistryCardsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <LabelCard label={label} />
      <Owner owner={owner.address} />
      <NetworkCard network={network} />
    </div>
  )
}
