import type { Address } from 'viem'
import { Owner } from '@/features/profile/components/Owner'
import type { ProtocolVersion } from '@/utils/types'
import { ContractCard } from './ContractCard'
import { LabelCard } from './LabelCard'
import { NetworkCard } from './NetworkCard'
import { ProtocolCard } from './ProtocolCard'

type RegistryCardsGridProps = {
  label: string
  protocol: ProtocolVersion
  owner?: Address
  contractAddress?: Address
  factoryAddress?: Address
  chainId?: number
}

export function RegistryCardsGrid({
  label,
  protocol,
  owner,
  contractAddress,
  factoryAddress,
  chainId,
}: RegistryCardsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 w-full">
      <LabelCard label={label} />
      {owner && <Owner owner={owner} />}
      {contractAddress && (
        <ContractCard
          label="Contract"
          address={contractAddress}
          chainId={chainId}
        />
      )}
      <ProtocolCard protocol={protocol} />
      <NetworkCard />
      {factoryAddress && (
        <ContractCard
          label="Factory"
          address={factoryAddress}
          chainId={chainId}
        />
      )}
    </div>
  )
}
