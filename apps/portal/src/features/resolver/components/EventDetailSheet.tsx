import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import type { PropsWithChildren } from 'react'
import type { Address, Hash } from 'viem'
import { useTransaction } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataRow } from '@/components/DataRow'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { ResolverEvent } from '@/features/resolver/hooks/useResolverOverview'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  getEventFieldType,
  getEventSignature,
} from '@/utils/ens/eventSignatures'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type EventWithFrom = ResolverEvent & {
  readonly from?: Address | null
}

interface EventDetailSheetProps extends PropsWithChildren {
  readonly event: EventWithFrom | null
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

class ParseEventDataError extends TaggedError('ParseEventDataError')<{
  cause: unknown
  raw: string
}> {}

const parseEventData = (
  data: string,
): Result<Record<string, string>, ParseEventDataError> => {
  try {
    return ok(JSON.parse(data) as Record<string, string>)
  } catch (cause) {
    return err(new ParseEventDataError({ cause, raw: data }))
  }
}

const TransactionDetails = ({ event }: { readonly event: EventWithFrom }) => {
  const txHash = event.transactionHash as Hash | null

  const {
    data: txData,
    isLoading,
    error,
  } = useTransaction({
    hash: txHash ?? undefined,
    query: { enabled: !!txHash },
  })

  const formattedTimestamp = event.timestamp
    ? formatTimestamp(BigInt(event.timestamp))
    : null

  const parsedResult = parseEventData(event.data)

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="text-red-500">
          Error loading transaction: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-4 p-6 border border-border rounded-lg">
        {txHash && (
          <DataRow label="Tx Hash">
            <CopyableRecord
              value={txHash}
              displayValue={
                <span className="flex items-center gap-1">
                  {truncateAddress(txHash, 10, 8, '...')}
                </span>
              }
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
            />
          </DataRow>
        )}

        {formattedTimestamp && (
          <DataRow label="Timestamp">
            <CopyableRecord
              value={formattedTimestamp}
              displayValue={<span>{formattedTimestamp} UTC</span>}
            />
          </DataRow>
        )}

        {txData && (
          <>
            <DataRow label="Network">
              <span>Sepolia</span>
            </DataRow>

            <DataRow label="From">
              <AddressDisplay address={txData.from} />
            </DataRow>

            <DataRow label="To">
              {txData.to ? (
                <AddressDisplay address={txData.to} />
              ) : (
                <span className="text-quartz-500">Contract Creation</span>
              )}
            </DataRow>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">1 event</h3>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-6 py-3 bg-quartz-50">
              <span className="text-sm font-medium">{event.type}</span>
            </div>

            <div className="p-6 flex flex-col gap-8">
              <div className="flex flex-col gap-4 w-full">
                <CopyableRecord
                  value={event.type}
                  displayValue={
                    <h3 className="text-xl font-medium">{event.type}</h3>
                  }
                />

                {txHash && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 items-start sm:items-center">
                    <span className="text-base font-semibold text-black shrink-0 sm:min-w-[160px]">
                      Transaction
                    </span>
                    <CopyableRecord
                      value={txHash}
                      displayValue={
                        <span className="flex items-center gap-1">
                          {truncateAddress(txHash, 10, 8, '...')}
                        </span>
                      }
                      className="text-sm flex-1 min-w-0"
                    />
                  </div>
                )}

                <div className="flex flex-row gap-6 items-center">
                  <span className="text-base font-semibold text-black sm:min-w-[160px]">
                    Event
                  </span>
                  <CopyableRecord
                    value={getEventSignature(event.type)}
                    displayValue={
                      <div className="w-full max-w-110">
                        {getEventSignature(event.type)}
                      </div>
                    }
                    truncate={false}
                  />
                </div>
              </div>

              {parsedResult.match(
                (parsed) => (
                  <div>
                    <h4 className="text-base font-semibold mb-3">Data</h4>
                    <div className="border rounded-lg overflow-auto">
                      <table className="w-full">
                        <thead className="bg-quartz-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-quartz-700 w-12">
                              #
                            </th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-quartz-700">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-quartz-700">
                              Type
                            </th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-quartz-700">
                              Data
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(parsed).map(([key, value], index) => (
                            <tr key={key} className="border-t">
                              <td className="px-4 py-3 text-sm">{index}</td>
                              <td className="px-4 py-3 text-sm">{key}</td>
                              <td className="px-4 py-3 text-sm">
                                {getEventFieldType(event.type, key)}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <CopyableRecord
                                  value={String(value)}
                                  displayValue={
                                    <span className="break-all">{value}</span>
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
                (parseError) => (
                  <div>
                    <h4 className="text-base font-semibold mb-3">Data</h4>
                    <div className="border rounded-lg p-4 flex flex-col gap-2">
                      <span className="text-sm text-red-500">
                        Unable to parse event data
                      </span>
                      <CopyableRecord
                        value={parseError.raw}
                        displayValue={
                          <pre className="text-xs font-mono text-quartz-500 whitespace-pre-wrap break-all">
                            {parseError.raw}
                          </pre>
                        }
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export const EventDetailSheet = ({
  children,
  event,
  open,
  setOpen,
}: EventDetailSheetProps) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white p-0 flex flex-col h-dvh"
      >
        <div className="p-6 shrink-0 border-b">
          <SheetHeader>
            <SheetTitle className="font-sans text-heading font-medium">
              Transaction
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {event ? (
            <TransactionDetails event={event} />
          ) : (
            <div className="text-quartz-400 text-center py-12">
              No transaction selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
