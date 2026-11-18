import { CirclePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const AddRecordButton = ({
  disabledReason,
  onClick,
}: {
  readonly disabledReason: string | null
  readonly onClick: () => void
}) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  const isUnavailable = disabledReason !== null

  return (
    <Tooltip
      open={isUnavailable && isTooltipOpen}
      onOpenChange={(open) => setIsTooltipOpen(isUnavailable && open)}
    >
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="default"
          onClick={onClick}
          aria-disabled={isUnavailable || undefined}
          className="flex items-center gap-2 whitespace-nowrap aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary"
        >
          Add record
          <CirclePlus className="size-4" />
        </Button>
      </TooltipTrigger>
      {isUnavailable && (
        <TooltipContent className="max-w-64 wrap-anywhere">
          {disabledReason}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
