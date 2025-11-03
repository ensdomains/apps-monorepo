import type { Row } from '@tanstack/react-table'
import type { FC, PropsWithChildren } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

export const ReverseResolutionSidebar: FC<
  PropsWithChildren<{
    row: Row<ReverseResolutionResult> | null
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, open, setOpen }) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6">
          <SheetHeader>
            <SheetTitle className="font-sans text-[28px] font-medium">
              Reverse Resolution Details
            </SheetTitle>
          </SheetHeader>

          {row ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-lg">Network</h3>
                <div className="flex items-center gap-2">
                  {row.original.icon && (
                    <img
                      src={row.original.icon}
                      alt={row.original.label}
                      className="w-6 h-6"
                    />
                  )}
                  <span>{row.original.label}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-lg">CoinType</h3>
                <span className="font-mono">{row.original.coinType}</span>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-lg">Name</h3>
                <span className="font-mono">{row.original.name || 'null'}</span>
              </div>

              {row.original.reverseResolverAddress && (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium text-lg">
                    Reverse Resolver Address
                  </h3>
                  <span className="font-mono text-sm break-all">
                    {row.original.reverseResolverAddress}
                  </span>
                </div>
              )}

              {row.original.resolverAddress && (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium text-lg">Resolver Address</h3>
                  <span className="font-mono text-sm break-all">
                    {row.original.resolverAddress}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-lg">Normalized</h3>
                <span>{row.original.normalized ? 'Yes' : 'No'}</span>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-lg">Forward Match</h3>
                <span>{row.original.forwardMatch ? 'True' : 'False'}</span>
                {row.original.forwardMatch && (
                  <span className="text-sm text-gray-600">
                    This name resolves back to this address (Primary name)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center py-12">
              No resolution selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
