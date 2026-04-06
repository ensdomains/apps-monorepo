import type { Address } from 'viem'
import { Owner } from '@/features/profile/components/Owner'
import { cn } from '@/lib/utils'
import type { ProtocolVersion } from '@/utils/types'
import { LabelCard } from './LabelCard'
import { NetworkCard } from './NetworkCard'

type RegistryCardsGridProps = {
  label: string
  owner?: Address
  protocolVersion: ProtocolVersion
}

export function RegistryCardsGrid({ label, owner }: RegistryCardsGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 md:gap-6 w-full',
        owner ? 'md:grid-cols-3' : 'md:grid-cols-2',
      )}
    >
      <LabelCard label={label} />
      {owner && <Owner owner={owner} />}
      <NetworkCard />
    </div>
  )
}
