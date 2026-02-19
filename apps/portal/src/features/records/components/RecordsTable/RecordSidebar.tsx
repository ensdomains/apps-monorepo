import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import type { EnsNetworkName } from '@/utils/types'
import { RecordDetails } from '../RecordDetails'
import type { NameRecord } from './columns'

export const RecordSidebar: FC<
  PropsWithChildren<{
    row: Row<NameRecord> | null
    name: string
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    network?: EnsNetworkName
  }>
> = ({ children, row, name, open, setOpen, network }) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto max-h-dvh sm:max-h-none"
      >
        {row && (
          <RecordDetails record={row.original} name={name} network={network} />
        )}
      </SheetContent>
    </Sheet>
  )
}
