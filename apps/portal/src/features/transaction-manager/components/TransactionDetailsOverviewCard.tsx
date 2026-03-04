import { ArrowRight, InfoIcon, PlayCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type TransactionDetailsOverviewCardProps = {
  index: number
  transaction: {
    title: string
    estimatedGasCost: number
    onStart: () => void
  }
  setFocusedTransaction: (transaction: number) => void
}

export const TransactionDetailsOverviewCard = ({
  index,
  transaction,
  setFocusedTransaction,
}: TransactionDetailsOverviewCardProps) => {
  const { title, estimatedGasCost } = transaction

  return (
    <button
      type="button"
      className={cn(
        'flex flex-col gap-4 p-4 rounded-lg border',
        'border-border text-quartz-900 cursor-pointer',
      )}
      onClick={() => setFocusedTransaction(index)}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-medium w-max text-quartz-900">
              {title}
            </h4>
            <Badge variant="warning" className="font-normal">
              <PlayCircle className="size-3 mr-0.5" /> Not Started
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <InfoIcon className="size-4" />
            <ArrowRight className="size-4" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-1">
          <dt className="text-base font-medium">Est. Cost</dt>
          <dd className="text-base">{estimatedGasCost} ETH</dd>
        </dl>
      </div>
    </button>
  )
}
