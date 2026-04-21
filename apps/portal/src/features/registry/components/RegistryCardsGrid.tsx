import type { Address } from 'viem'
import { Owner } from '@/features/profile/components/Owner'
import { cn } from '@/lib/utils'
import { LabelCard } from './LabelCard'
import { NetworkCard } from './NetworkCard'

type RegistryCardsGridProps = {
  label: string
  owner?: Address
}

export function RegistryCardsGrid({ label, owner }: RegistryCardsGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 md:gap-6 w-full',
        owner ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
      )}
    >
      <LabelCard label={label} />
      {owner && <Owner owner={owner} />}
      <NetworkCard />
    </div>
  )
}
