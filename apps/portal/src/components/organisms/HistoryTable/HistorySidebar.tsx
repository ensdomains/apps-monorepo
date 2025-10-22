import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { HistoryTransaction } from './columns'

export const HistorySidebar: FC<
  PropsWithChildren<{
    row: Row<HistoryTransaction> | null
    name: string
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, open, setOpen }) => {
  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent side="right" className="sm:max-w-[880px] bg-white">
        {row ? (
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-2xl font-bold">Transaction Details</h2>
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-sm text-gray-500">Transaction ID</span>
                <p className="font-mono text-sm break-all">
                  {row.original.transactionID}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Block Number</span>
                <p className="font-mono">{row.original.blockNumber}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Events</span>
                <p>{row.original.events.length} event(s)</p>
              </div>
            </div>
            {/* TODO: Add detailed transaction information here */}
            <div className="text-gray-400 text-center py-12">
              Transaction details coming soon...
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-center py-12">
            No transaction selected
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
