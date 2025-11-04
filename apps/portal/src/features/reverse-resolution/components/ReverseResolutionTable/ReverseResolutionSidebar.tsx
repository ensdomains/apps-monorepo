import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Row } from '@tanstack/react-table'
import { ArrowLeftRight, CheckCircle2, XCircle } from 'lucide-react'
import { type FC, type PropsWithChildren, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { EventsDataTable } from '@/components/table/EventsDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useBlockTimestamps } from '@/features/profile/hooks/useBlockTimestamps'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { useIsMobile } from '@/hooks/use-mobile'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

const AddressHistory = ({
  history,
  name,
}: {
  history: ReturnResolverEvent[]
  name: string
}) => {
  const {
    data: timestamps,
    isLoading,
    error,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
  })

  if (error) return <div>Error loading timestamps: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  const data = groupEventsByTransactionId(
    history.map((item) => ({
      ...item,
      timestamp: timestamps?.get(BigInt(item.blockNumber)),
    })),
    'resolver',
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row justify-between items-center">
        <h3 className="text-xl font-medium">History</h3>
        <Link to="/$name/history" params={{ name }}>
          <Button variant="outline" size="sm">
            Full history
          </Button>
        </Link>
      </div>
      <EventsDataTable name={name} data={data} />
    </div>
  )
}

const HistoryView = ({ name }: { name: string }) => {
  const {
    data: history,
    isLoading,
    error,
  } = useQuery(
    getRecordHistoryQueryOptions({
      name,
      key: 'coins',
    }),
  )

  if (error) {
    return <div>History Error: {error.cause?.message || error.message}</div>
  }

  if (isLoading) return <div>Loading history...</div>

  if (!history || history.length === 0) {
    return <div className="text-gray-400">No history available</div>
  }

  return <AddressHistory history={history} name={name} />
}

export const ReverseResolutionSidebar: FC<
  PropsWithChildren<{
    row: Row<ReverseResolutionResult> | null
    address: Address
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, address, open, setOpen }) => {
  const isMobile = useIsMobile()
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !row) {
      setNameInput('')
      setNameError(null)
    }
  }, [open, row])

  if (!row) {
    return (
      <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
        {children}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="sm:max-w-[880px] bg-white overflow-y-auto"
        >
          <div className="p-6 flex flex-col gap-6">
            <div className="text-gray-400 text-center py-12">
              No resolution selected
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const { name, defaultName, coinType, label, icon, forwardMatch } =
    row.original

  const displayName =
    name || (defaultName && coinType !== 60 ? defaultName : null)
  const isInheritingDefault = !name && defaultName && coinType !== 60

  const isPrimaryName = forwardMatch || isInheritingDefault

  // Show "Set primary name" button when name exists but isn't primary yet
  const showSetPrimaryButton = displayName && !isPrimaryName && name !== null

  const validateName = (value: string): boolean => {
    if (!value) {
      setNameError(null)
      return true
    }

    if (!value.endsWith('.eth')) {
      setNameError('Name must end with .eth')
      return false
    }

    setNameError(null)
    return true
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNameInput(value)
    validateName(value)
  }

  const handleUpdate = () => {
    if (validateName(nameInput) && nameInput) {
      // TODO: Implement setName for specific coinType
      console.log('Update name for coinType', coinType, 'to', nameInput)
    }
  }

  const handleSetPrimaryName = () => {
    // TODO: Implement setPrimaryName - set forward resolution
    console.log('Set primary name for', displayName, 'on coinType', coinType)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6">
          <SheetHeader>
            <div className="flex flex-row justify-between items-center">
              <SheetTitle className="font-sans text-[28px] font-medium">
                {label} resolution
              </SheetTitle>
              {showSetPrimaryButton && (
                <Button onClick={handleSetPrimaryName} variant="default">
                  Set primary name
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Banner */}
          {isPrimaryName && displayName && (
            <div className="flex items-center gap-3 bg-gray-100 p-4 rounded-md">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <span className="font-medium">
                This is the primary name on {label}
              </span>
            </div>
          )}

          {!isPrimaryName && displayName && (
            <div className="flex items-center gap-3 bg-gray-100 p-4 rounded-md">
              <XCircle className="w-6 h-6 shrink-0" />
              <span className="text-sm">
                The set address does not resolve back to this name on {label}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div className="flex flex-row items-start">
              <div className="w-40 font-medium">Network</div>
              <div className="flex items-center gap-2">
                {icon && <img src={icon} alt={label} className="w-5 h-5" />}
                <span>{label}</span>
              </div>
            </div>

            <div className="flex flex-row items-start">
              <div className="w-40 font-medium">Name</div>
              <div className="flex-1 flex flex-col gap-2">
                {displayName && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono">{displayName}</span>
                    {isInheritingDefault && (
                      <Badge variant="outline" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={nameInput}
                    onChange={handleNameChange}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleUpdate}
                    disabled={!nameInput || !!nameError}
                    size="sm"
                  >
                    Update
                  </Button>
                </div>
                {nameError && (
                  <span className="text-xs text-red-600">{nameError}</span>
                )}
              </div>
            </div>

            <div className="flex flex-row items-start">
              <div className="w-40 font-medium">Primary name</div>
              <div className="flex items-center gap-2 flex-wrap">
                {isPrimaryName ? (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>True</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <XCircle className="w-4 h-4" />
                    <span>False</span>
                  </Badge>
                )}
                <div className="flex flex-row items-center gap-2">
                  <CopyableRecord
                    value={address}
                    truncate
                    displayValue={
                      <span className="flex items-center gap-1">
                        {address.slice(0, 5)}...
                        {address.slice(-4)}
                      </span>
                    }
                    className="font-mono text-sm"
                  />
                  <ArrowLeftRight className="w-5 h-5" />
                  {displayName && (
                    <>
                      <NameAvatar
                        name={displayName}
                        width="20px"
                        height="20px"
                      />
                      <span>{displayName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {displayName && (
              <div className="border-t pt-6">
                <HistoryView name={displayName} />
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
