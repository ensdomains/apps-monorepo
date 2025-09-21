import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { RecordDetails } from '../RecordDetails/RecordDetails'
import type { NameRecord } from './columns'

export const RecordSidebar: FC<
  PropsWithChildren<{
    row: Row<NameRecord> | null
    name: string
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, name, open, setOpen }) => {
  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent side="right" className="sm:max-w-[880px] bg-white">
        {row && <RecordDetails record={row.original} name={name} />}
      </SheetContent>
    </Sheet>
  )
}
