import { ScrollTextIcon } from 'lucide-react'
import { useState } from 'react'
import type { Hash } from 'viem'
import { useTransactionReceipt } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getEventFieldType,
  getEventSignature,
} from '@/utils/ens/eventSignatures'
import { formatEventValue } from '@/utils/ens/formatEventValue'

type Event = {
  id: string
  type: string
  category: 'domain' | 'registration' | 'resolver'
  details: Record<string, unknown>
}

const EventData = ({ event, txHash }: { event: Event; txHash: Hash }) => {
  const [showDecoded, setShowDecoded] = useState(true)

  const { data: receipt } = useTransactionReceipt({
    hash: txHash,
  })

  // Find the matching log for this event by matching the log index from the event ID
  const eventLogIndex = event.id.split('-')[1]
  const parsedLogIndex = Number.parseInt(eventLogIndex, 10)

  // Match by logIndex property
  const eventLog = receipt?.logs.find((log) => log.logIndex === parsedLogIndex)

  // Filter out metadata fields from details
  const dataFields = Object.entries(event.details).filter(
    ([key]) => !['id', 'blockNumber', 'transactionID', 'type'].includes(key),
  )

  return (
    <div>
      <div className="w-full flex items-center justify-between">
        <h4 className="text-base font-semibold mb-3">Data</h4>

        <div className="flex items-center gap-3 mb-4">
          <Label htmlFor="showDecoded">
            {showDecoded ? 'Decoded' : 'Encoded'}
          </Label>
          <Switch
            checked={showDecoded}
            onCheckedChange={() => setShowDecoded((prev) => !prev)}
          />
        </div>
      </div>

      {showDecoded ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 w-12">
                  #
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                  Data
                </th>
              </tr>
            </thead>
            <tbody>
              {dataFields.map(([key, value], index) => (
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
                        <span className="break-all">
                          {formatEventValue(key, value)}
                        </span>
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg">
          {eventLog ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Data:</p>
                <CopyableRecord
                  value={eventLog.data}
                  displayValue={
                    <p className="text-xs font-mono break-all text-gray-900">
                      {eventLog.data}
                    </p>
                  }
                />
              </div>
              {eventLog.topics.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Topics:
                  </p>
                  <div className="space-y-2">
                    {eventLog.topics.map((topic, i) => (
                      <CopyableRecord
                        key={topic}
                        value={topic}
                        displayValue={
                          <p className="text-xs font-mono break-all text-gray-900">
                            [{i}]: {topic}
                          </p>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">
              Encoded data not available. Transaction receipt may still be
              loading.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export const TransactionEvents = ({
  events,
  txHash,
}: {
  events: Event[]
  txHash: Hash
}) => {
  if (events.length === 0) {
    return <div className="text-gray-400 text-center py-6">No events found</div>
  }

  const firstEventType = events[0].type

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{events.length} events</h3>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue={firstEventType} className="w-full">
            <div className="overflow-x-auto">
              <TabsList className="w-full justify-start rounded-none p-0 inline-flex">
                {events.map((event) => (
                  <TabsTrigger
                    key={event.id}
                    value={event.type}
                    className="whitespace-nowrap"
                  >
                    {event.type}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {events.map((event) => (
              <TabsContent key={event.id} value={event.type} className="p-6">
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <CopyableRecord
                        value={event.type}
                        displayValue={
                          <h3 className="text-2xl font-medium">{event.type}</h3>
                        }
                      />

                      <Button asChild variant="outline" size="sm">
                        <a
                          href="https://github.com/ensdomains/ens-contracts"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5"
                        >
                          <ScrollTextIcon />
                          <span className="text-sm">Go to docs</span>
                        </a>
                      </Button>
                    </div>
                    <div className="flex flex-row gap-6 items-center">
                      <span className="text-base font-semibold text-black sm:min-w-[160px]">
                        Transaction
                      </span>
                      <CopyableRecord
                        value={txHash}
                        displayValue={
                          <span className="flex items-center gap-1">
                            {txHash.slice(0, 10)}...{txHash.slice(-8)}
                          </span>
                        }
                        className="text-sm"
                      />
                    </div>
                    <div className="flex flex-row gap-6 items-center">
                      <span className="text-base font-semibold text-black sm:min-w-[160px]">
                        Event
                      </span>
                      <CopyableRecord
                        value={getEventSignature(event.type)}
                        displayValue={
                          <div>
                            <p className="text-sm break-all font-mono">
                              {getEventSignature(event.type)}
                            </p>
                          </div>
                        }
                      />
                    </div>
                  </div>
                  <EventData event={event} txHash={txHash} />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
