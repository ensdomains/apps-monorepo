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
import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import { computeDisplayNameState } from '@/utils/reverseResolution/computeDisplayNameState'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'
import { useSetForwardResolution } from '../../hooks/useSetForwardResolution'
import { useSetL2ReverseName } from '../../hooks/useSetL2ReverseName'
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
        <Button variant="ghost" size="sm" asChild>
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
    switchChainAsync,
    getSwitchToRequiredNetworkRequest,
  } = useSwitchToRequiredNetwork({
    reverseRegistrarChainId,
  })

  const {
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    isEnsOwnerLoading,
  } = useReverseResolutionMutations({
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

  // L2 reverse-registrar `setName` runs through a hook scoped to the local
  // `l2WagmiConfig` (see `@/lib/wagmiL2`). The global wagmi config is
  // intentionally not aware of L2 chains — this hook is the only place
  // L2 writes happen.
  const isL2Target = !isL1ReverseRegistrarChainId(reverseRegistrarChainId)
  const { setL2ReverseNameAsync, isPending: isL2ReverseNamePending } =
    useSetL2ReverseName()

  if (!row) {
    return (
      <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
        {children}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="sm:max-w-[880px] bg-background overflow-y-auto"
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

  // Awaits the wallet's chain switch if the current chain doesn't match the
  // row's required chain. Returns `true` when the switch completed and the
  // caller should continue, `false` if the user rejected or the wallet
  // refused — in which case the caller must NOT continue (a toast has
  // already been surfaced).
  const switchChainIfNeeded = async (): Promise<boolean> => {
    if (!isWrongChain) return true
    try {
      await switchChainAsync(getSwitchToRequiredNetworkRequest())
      return true
    } catch (error) {
      // User rejected, wallet refused to add chain, etc. Surface it.
      const message =
        error instanceof Error ? error.message : 'Failed to switch network'
      toast.error(message)
      console.error('Failed to switch network', error)
      return false
    }
  }

  const handleUpdateL2 = async () => {
    if (!nameInput) return
    if (isL1ReverseRegistrarChainId(reverseRegistrarChainId)) return
    const toastId = toast.loading(`Setting reverse name on ${label}…`)
    try {
      await setL2ReverseNameAsync({
        name: nameInput,
        // safe: branch above narrows out L1 chain ids
        reverseRegistrarChainId: reverseRegistrarChainId as Exclude<
          typeof reverseRegistrarChainId,
          1 | 60
        >,
      })
      toast.success(`Reverse name set to ${nameInput} on ${label}`, {
        id: toastId,
      })
      setNameInput('')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to set reverse name on L2',
        { id: toastId },
      )
    }
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.querySelector<HTMLInputElement>('input[name="name"]')
    if (!input?.reportValidity()) return
    if (!nameInput) return

    // Switch first if the wallet is on the wrong chain; only continue with
    // the actual write once the switch is complete. Doing this fire-and-
    // forget previously meant the first click only switched chains and the
    // user had to click Update again to submit.
    //
    // For L2 rows we delegate the switch to `useSetL2ReverseName`, which
    // operates on the isolated `l2WagmiConfig` and handles
    // `wallet_addEthereumChain` correctly — calling `switchChainAsync` here
    // on the global config would target a chain it doesn't know about.
    void (async () => {
      if (isL2Target) {
        await handleUpdateL2()
        return
      }
      const switched = await switchChainIfNeeded()
      if (!switched) return
      setActiveFlow('reverse')
      openTransactionModal()
    })()
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
    void (async () => {
      const switched = await switchChainIfNeeded()
      if (!switched) return
      setActiveFlow('primary')
      openTransactionModal()
    })()
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
        className="sm:max-w-[880px] bg-background overflow-y-auto"
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
                    isEnsOwnerLoading ||
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
                      isL2ReverseNamePending ||
                      isSwitchingChain
                    }
                    placeholder={match(isConnected)
                      .with(false, () => 'Connect wallet to update')
                      .otherwise(() => undefined)}
                    // L1 (Default/Ethereum) requires a real ENS `.eth` name
                    // because we look up its protocol version to decide on
                    // the right setReverseName flow. L2 registrars accept any
                    // string, so we don't gate the input there.
                    {...(isL2Target
                      ? {}
                      : {
                          pattern: '.*\\.eth$',
                          title: 'Name must end with .eth',
                        })}
                    required
                  />
                  <Button
                    type="submit"
                    variant="default"
                    disabled={
                      !isConnected ||
                      !nameInput ||
                      isReverseResolutionPending ||
                      isL2ReverseNamePending ||
                      isSwitchingChain
                    }
                    className="h-9"
                  >
                    {match({
                      isConnected,
                      isSwitchingChain,
                      isWrongChain,
                      isL2ReverseNamePending,
                    })
                      .with({ isConnected: false }, () => 'Connect Wallet')
                      .with({ isSwitchingChain: true }, () => 'Switching...')
                      .with({ isWrongChain: true }, () => 'Switch Network')
                      .with({ isL2ReverseNamePending: true }, () => 'Sending…')
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
