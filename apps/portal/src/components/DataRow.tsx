import { InfoIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const DataRow = ({
  label,
  tooltip,
  children,
}: {
  label: string
  tooltip?: string
  children: ReactNode
}) => {
  return (
    <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 items-start lg:items-center w-full">
      <div className="flex gap-1 items-center min-w-[160px]">
        <span className="font-medium text-base">{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="size-4 text-quartz-400" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex-1 min-w-0 w-full">{children}</div>
    </div>
  )
}
