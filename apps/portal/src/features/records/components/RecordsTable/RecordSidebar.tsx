import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
        className="sm:max-w-[880px] bg-card p-0 flex flex-col h-dvh"
      >
        <div className="p-6 shrink-0 border-b">
          <SheetHeader>
            <SheetTitle className="font-sans text-heading font-medium capitalize">
              {row?.original.type} record
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {row ? (
            <RecordDetails
              record={row.original}
              name={name}
              network={network}
            />
          ) : (
            <div className="text-muted-foreground text-center py-12">
              No record selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
