import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Row } from '@tanstack/react-table'
import { ArrowLeftRight, CheckCircle2, Clock, XCircle } from 'lucide-react'
import {
  type FC,
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address, Hash } from 'viem'
import { useConnection } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
import { LoadingSpinner } from '@/components/LoadingSpinner'
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
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { getRecordHistoryQueryOptions } from '@/features/records/hooks/useRecordHistory'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useIsMobile } from '@/hooks/use-mobile'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { computeDisplayNameState } from '@/utils/reverseResolution/computeDisplayNameState'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'
import { useSetForwardResolution } from '../../hooks/useSetForwardResolution'
import { useSetReverseResolution } from '../../hooks/useSetReverseResolution'
import { useReverseResolutionMutations } from './hooks/useReverseResolutionMutations'
import { useSwitchToRequiredNetwork } from './hooks/useSwitchToRequiredNetwork'

const UPDATE_REVERSE_NAME_TX_ID = 'tx-update-reverse-name'
const SET_PRIMARY_NAME_TX_ID = 'tx-set-primary-name'

type ActiveFlow = 'reverse' | 'primary'

interface AddressHistoryProps {
  history: ReturnResolverEvent[]
  name: string
}

const AddressHistory = ({ history, name }: AddressHistoryProps) => {
  const groupedData = groupEventsByTransactionId(history, 'resolver')

  const {
    data: timestampsData,
    isLoading: isLoadingTimestamps,
    error: timestampsError,
  } = useBlockTimestamps({
    blocks: history.map((item) => BigInt(item.blockNumber)),
  })

  const {
    data: sendersData,
    isLoading: isLoadingSenders,
    error: sendersError,
  } = useTransactionSenders({
    transactionHashes: groupedData.map((tx) => tx.transactionID as Hash),
  })

  if (isLoadingTimestamps && isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction data..." />
  }
  if (isLoadingTimestamps) {
    return <LoadingSpinner title="Loading timestamps..." />
  }
  if (isLoadingSenders) {
    return <LoadingSpinner title="Loading transaction senders..." />
  }

  if (timestampsError) {
    return <div>Error loading timestamps: {timestampsError.cause?.message}</div>
  }
  if (sendersError) {
    return (
      <div>
        Error loading transaction senders: {sendersError.cause?.message}
      </div>
    )
  }

  if (!timestampsData || !sendersData) {
    return <div>No data available</div>
  }

  const dataWithTimestampsAndSenders = groupedData.map((tx) => ({
    ...tx,
    timestamp: timestampsData.get(BigInt(tx.blockNumber)),
    from: sendersData.get(tx.transactionID as Hash) || tx.from,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row justify-between items-center">
        <h3 className="text-2xl font-medium">History</h3>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/$name/history" params={{ name }}>
            <Clock className="size-4" />
            Full history
          </Link>
        </Button>
      </div>
      <EventsDataTable name={name} data={dataWithTimestampsAndSenders} />
    </div>
  )
}

interface HistoryViewProps {
  name: string
}

const HistoryView = ({ name }: HistoryViewProps) => {
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
    return <div className="text-muted-foreground">No history available</div>
  }

  return <AddressHistory history={history} name={name} />
}

interface ReverseResolutionSidebarProps extends PropsWithChildren {
  row: Row<ReverseResolutionResult> | null
  address: Address
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const ReverseResolutionSidebar: FC<ReverseResolutionSidebarProps> = ({
  children,
  row,
  address,
  open,
  setOpen,
}) => {
  const isMobile = useIsMobile()
  const { isConnected } = useConnection()

  const {
    reverseRegistrarChainId,
    name,
    defaultName,
    label = '',
    icon,
    forwardMatch = false,
  } = useMemo(() => {
    const r = row?.original
    return {
      reverseRegistrarChainId: (r?.reverseRegistrarChainId ??
        60) as ReverseRegistrarChainId,
      name: r?.name ?? null,
      defaultName: r?.defaultName ?? null,
      label: r?.label ?? '',
      icon: r?.icon,
      forwardMatch: r?.forwardMatch ?? false,
    }
  }, [row])

  const { displayName, isInheritingDefault, isPrimaryName, canSetAsPrimary } =
    computeDisplayNameState({
      name,
      defaultName,
      forwardMatch,
      reverseRegistrarChainId,
    })

  const [nameInput, setNameInput] = useState('')

  // Reset input state when sidebar closes or row changes
  useEffect(() => {
    if (!open || !row) {
      setNameInput('')
    }
  }, [open, row])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.currentTarget.value)
  }

  const {
    isWrongChain,
    isSwitchingChain,
    requiredChainId,
    switchChain,
    getSwitchToRequiredNetworkRequest,
  } = useSwitchToRequiredNetwork({
    reverseRegistrarChainId,
  })

  const { getReverseResolutionRequest, getForwardResolutionRequest } =
    useReverseResolutionMutations({
      reverseRegistrarChainId,
      displayName,
    })

  const {
    openModal: openTransactionModal,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null)

  const {
    setReverseResolution: submitReverseResolution,
    isPending: isReverseResolutionPending,
  } = useSetReverseResolution({
    chainId: requiredChainId,
    id: UPDATE_REVERSE_NAME_TX_ID,
  })

  const {
    setForwardResolution: submitForwardResolution,
    isPending: isForwardResolutionPending,
  } = useSetForwardResolution({
    chainId: requiredChainId,
    id: SET_PRIMARY_NAME_TX_ID,
  })

  if (!row) {
    return (
      <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
        {children}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="sm:max-w-[880px] bg-card overflow-y-auto"
        >
          <div className="p-6 flex flex-col gap-6">
            <div className="text-muted-foreground text-center py-12">
              No resolution selected
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const switchChainIfNeeded = () => {
    if (!isWrongChain) return false
    try {
      switchChain(getSwitchToRequiredNetworkRequest())
    } catch (error) {
      console.error('Failed to switch network', error)
    }
    return true
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.querySelector<HTMLInputElement>('input[name="name"]')
    if (!input?.reportValidity()) return
    if (switchChainIfNeeded()) return
    if (!nameInput) return
    setActiveFlow('reverse')
    openTransactionModal()
  }

  const handleUpdateReverseStart = () => {
    if (!nameInput) return
    try {
      const reverseRequest = getReverseResolutionRequest(nameInput)
      submitReverseResolution({
        name: nameInput,
        request: reverseRequest.request,
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to set reverse name',
      )
      closeTransactionModal()
      clearTransaction()
    }
  }

  const handleUpdateReverseDone = () => {
    closeTransactionModal()
    clearTransaction()
    setNameInput('')
  }

  const handleSetPrimaryName = () => {
    if (switchChainIfNeeded()) return
    setActiveFlow('primary')
    openTransactionModal()
  }

  const handleSetPrimaryNameStart = () => {
    if (!displayName) return
    try {
      const request = getForwardResolutionRequest(address)
      submitForwardResolution({ name: displayName, request })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to set primary name',
      )
      closeTransactionModal()
      clearTransaction()
    }
  }

  const handleSetPrimaryNameDone = () => {
    closeTransactionModal()
    clearTransaction()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-card overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6">
          <SheetHeader>
            <div className="flex flex-row justify-between items-center">
              <SheetTitle className="font-sans text-heading font-medium">
                {label} resolution
              </SheetTitle>
              {canSetAsPrimary && (
                <Button
                  onClick={handleSetPrimaryName}
                  variant="default"
                  disabled={
                    !isConnected ||
                    isForwardResolutionPending ||
                    isSwitchingChain
                  }
                >
                  {match({
                    isConnected,
                    isSwitchingChain,
                    isWrongChain,
                  })
                    .with({ isConnected: false }, () => 'Connect Wallet')
                    .with({ isSwitchingChain: true }, () => 'Switching...')
                    .with({ isWrongChain: true }, () => 'Switch Network')
                    .otherwise(() => 'Set primary name')}
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Banner */}
          {isPrimaryName && displayName && (
            <div className="flex items-center gap-3 bg-muted p-4 rounded-md">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <span className="font-medium">
                This is the primary name on {label}
              </span>
            </div>
          )}

          {!isPrimaryName && displayName && (
            <div className="flex items-center gap-3 bg-muted p-4 rounded-md">
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
                <form onSubmit={handleUpdate} className="flex gap-2">
                  <Input
                    type="text"
                    name="name"
                    value={nameInput}
                    onChange={handleNameChange}
                    disabled={
                      !isConnected ||
                      isReverseResolutionPending ||
                      isSwitchingChain
                    }
                    placeholder={match(isConnected)
                      .with(false, () => 'Connect wallet to update')
                      .otherwise(() => undefined)}
                    pattern=".*\.eth$"
                    title="Name must end with .eth"
                    required
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={
                      !isConnected ||
                      !nameInput ||
                      isReverseResolutionPending ||
                      isSwitchingChain
                    }
                    className="h-9"
                  >
                    {match({
                      isConnected,
                      isSwitchingChain,
                      isWrongChain,
                    })
                      .with({ isConnected: false }, () => 'Connect Wallet')
                      .with({ isSwitchingChain: true }, () => 'Switching...')
                      .with({ isWrongChain: true }, () => 'Switch Network')
                      .otherwise(() => 'Update')}
                  </Button>
                </form>
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
                    <div className="flex items-center gap-2 flex-1">
                      <NameAvatar
                        name={displayName}
                        width="20px"
                        height="20px"
                      />
                      <span>{displayName}</span>
                    </div>
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
      <TransactionModal
        transactions={
          activeFlow === 'reverse'
            ? [
                {
                  id: UPDATE_REVERSE_NAME_TX_ID,
                  title: 'Update reverse name',
                  transactionName: `Set reverse name to ${nameInput}`,
                  estimatedGasCost: 0.0001,
                  onStart: handleUpdateReverseStart,
                  onDone: handleUpdateReverseDone,
                },
              ]
            : [
                {
                  id: SET_PRIMARY_NAME_TX_ID,
                  title: 'Set primary name',
                  transactionName: `Set primary name to ${displayName}`,
                  estimatedGasCost: 0.0002,
                  onStart: handleSetPrimaryNameStart,
                  onDone: handleSetPrimaryNameDone,
                },
              ]
        }
      />
    </Sheet>
  )
}
