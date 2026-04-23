import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'

type MultiNameExtensionSuccessProps = {
  readonly pricingData: readonly NamePricingData[]
  readonly onClose: () => void
}

export const MultiNameExtensionSuccess = ({
  pricingData,
  onClose,
}: MultiNameExtensionSuccessProps) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <CheckCircle2 className="size-10" />
        <h2 className="text-3xl font-medium">Extension complete</h2>
      </div>
      <ul className="space-y-2">
        {pricingData.map((item) => (
          <li key={item.selectedName.name}>
            <MultiNameExtensionSuccessCard pricingData={item} />
          </li>
        ))}
      </ul>
      <Button className="w-full" variant="secondary" onClick={onClose}>
        Done
      </Button>
    </div>
  )
}

type MultiNameExtensionSuccessCardProps = {
  readonly pricingData: NamePricingData
}

export const MultiNameExtensionSuccessCard = ({
  pricingData,
}: MultiNameExtensionSuccessCardProps) => {
  const { selectedName, isLoading, display } = pricingData

  if (isLoading || !display) {
    return <MultiNameExtensionSuccessCardSkeleton name={selectedName.name} />
  }

  const { newExpiryFormatted } = display

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3">
        <NameAvatar
          name={selectedName.name}
          height="40px"
          width="40px"
          rounded="rounded-md"
        />
        <div className="flex flex-col w-full gap-1">
          <div className="flex items-center justify-between">
            <span className="flex-1 text-left text-base font-medium text-foreground truncate">
              {selectedName.name}
            </span>
            <span className="text-base text-foreground shrink-0 ml-2">
              Expires {newExpiryFormatted}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

type MultiNameExtensionSuccessCardSkeletonProps = {
  readonly name: string
}

const MultiNameExtensionSuccessCardSkeleton = ({
  name,
}: MultiNameExtensionSuccessCardSkeletonProps) => (
  <div className="border-b border-border px-4 py-3 flex items-center gap-3">
    <NameAvatar name={name} height="40px" width="40px" rounded="rounded-md" />
    <div className="flex flex-col flex-1 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate">
          {name}
        </span>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  </div>
)
