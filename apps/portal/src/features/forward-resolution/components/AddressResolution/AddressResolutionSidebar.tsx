import { getRegistrarAddress } from '@ens-apps/l2-primary/v1'
import { defaultReverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/defaultReverseRegistrar'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { ArrowLeftRight, CheckCircle2, XCircle } from 'lucide-react'
import {
  type FC,
  type PropsWithChildren,
  type ReactNode,
  useState,
} from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
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
import { RecentActivity } from '@/features/profile/components/RecentActivity'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { useSaveRecords } from '@/features/records/hooks/useSaveRecords'
import { useSetReverseResolution } from '@/features/reverse-resolution/hooks/useSetReverseResolution'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useIsMobile } from '@/hooks/use-mobile'
import { names } from '@/lib/reverseRegistrarChainId'
import { fromCoinType } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import type { ProtocolVersion } from '@/utils/types'
import { MAINNET_COIN_TYPE } from './networks'
import type { AddressResolutionRow } from './types'

// The sidebar's history covers the name's resolution records only — address
// record writes and (v1) reverse-name changes — not transfers/registrations.
const ADDRESS_HISTORY_EVENT_TYPES = ['AddressChanged', 'NameChanged'] as const

const coinNetworkName = (coinType: number, fallback: string) => {
  try {
    return (
      (names as Record<number, string>)[fromCoinType(BigInt(coinType))] ??
      fallback
    )
  } catch {
    return fallback
  }
}

const RowLabel = ({ children }: PropsWithChildren) => (
  <div className="w-40 font-medium shrink-0">{children}</div>
)

const Banner = ({
  isPrimary,
  label,
  action,
}: {
  isPrimary: boolean
  label: string
  action?: ReactNode
}) => (
  <div className="flex items-center justify-between gap-3 bg-muted p-4 rounded-md">
    <div className="flex items-center gap-3">
      {isPrimary ? (
        <>
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <span className="font-medium">
            This is the primary name on {label}
          </span>
        </>
      ) : (
        <>
          <XCircle className="w-6 h-6 shrink-0" />
          <span className="text-sm">
            The set address does not resolve back to this name on {label}
          </span>
        </>
      )}
    </div>
    {action}
  </div>
)

const CoinTypeRow = ({
  coinType,
  icon,
  label,
}: {
  coinType: number
  icon: string
  label: string
}) => (
  <div className="flex flex-row items-start">
    <RowLabel>Coin Type</RowLabel>
    <div className="flex items-center gap-2">
      {icon && <img src={icon} alt={label} className="w-5 h-5" />}
      <span>
        {coinType} {coinNetworkName(coinType, label)}
      </span>
    </div>
  </div>
)

const AddressField = ({
  address,
  isOwner,
  addressInput,
  setAddressInput,
  disabled,
  saveDisabled,
  saveLabel,
  onSave,
}: {
  address: string | null
  isOwner: boolean
  addressInput: string
  setAddressInput: (v: string) => void
  disabled: boolean
  saveDisabled: boolean
  saveLabel: string
  onSave: () => void
}) => (
  <div className="flex flex-row items-start">
    <RowLabel>Address</RowLabel>
    <div className="flex-1 flex flex-col gap-2">
      {address ? (
        <CopyableRecord
          value={address}
          truncate={false}
          className="font-mono text-sm"
        />
      ) : (
        <span className="font-mono text-sm text-muted-foreground/50">null</span>
      )}
      {isOwner && (
        <div className="flex gap-2">
          <Input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="0x…"
            disabled={disabled}
            className="font-mono"
          />
          <Button
            onClick={onSave}
            disabled={saveDisabled}
            className="h-9 shrink-0"
          >
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  </div>
)

const PrimaryNameRow = ({
  isPrimary,
  address,
  reverseName,
  icon,
  label,
}: {
  isPrimary: boolean
  address: string | null
  reverseName: string | null | undefined
  icon: string
  label: string
}) => (
  <div className="flex flex-row items-start">
    <RowLabel>Primary name</RowLabel>
    <div className="flex items-center gap-2 flex-wrap">
      <Badge
        variant="outline"
        className={isPrimary ? 'text-xs' : 'text-xs text-muted-foreground'}
      >
        {isPrimary ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        <span>{isPrimary ? 'True' : 'False'}</span>
      </Badge>
      {address && (
        <div className="flex flex-row items-center gap-2">
          {reverseName ? (
            <div className="flex items-center gap-2">
              <NameAvatar name={reverseName} width="20px" height="20px" />
              <span>{reverseName}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">null</span>
          )}
          <ArrowLeftRight className="size-4" />
          {icon && <img src={icon} alt={label} className="w-5 h-5" />}
          <CopyableRecord
            value={address}
            truncate
            displayValue={
              <span>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            }
            className="font-mono text-sm"
          />
        </div>
      )}
    </div>
  </div>
)

const saveButtonLabel = (s: {
  isConnected: boolean
  isSwitchingChain: boolean
  isWrongChain: boolean
  isWriting: boolean
  isSyncing: boolean
}) => {
  if (!s.isConnected) return 'Connect Wallet'
  if (s.isSwitchingChain) return 'Switching…'
  if (s.isWrongChain) return 'Switch Network'
  if (s.isWriting) return 'Saving…'
  if (s.isSyncing) return 'Syncing…'
  return 'Save'
}

const ResolutionDetails = ({
  row,
  name,
  address,
  isOwner,
  addressInput,
  setAddressInput,
  isBusy,
  hasResolver,
  saveLabel,
  onSave,
  protocolVersion,
  canSetPrimaryName,
  onSetPrimaryName,
}: {
  row: AddressResolutionRow
  name: string
  address: string | null
  isOwner: boolean
  addressInput: string
  setAddressInput: (v: string) => void
  isBusy: boolean
  hasResolver: boolean
  saveLabel: string
  onSave: () => void
  protocolVersion: ProtocolVersion | undefined
  canSetPrimaryName: boolean
  onSetPrimaryName: () => void
}) => {
  const { label, icon, coinType, reverseMatch, reverseName } = row
  const isPrimary = reverseMatch === true

  return (
    <div className="p-6 flex flex-col gap-6">
      <SheetHeader>
        <SheetTitle className="font-sans text-heading font-medium">
          {label} resolution
        </SheetTitle>
      </SheetHeader>

      {address && (
        <Banner
          isPrimary={isPrimary}
          label={label}
          action={
            !isPrimary && canSetPrimaryName ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary font-medium shrink-0"
                onClick={onSetPrimaryName}
              >
                Set primary name
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="flex flex-col gap-6">
        <CoinTypeRow coinType={coinType} icon={icon} label={label} />
        <AddressField
          address={address}
          isOwner={isOwner}
          addressInput={addressInput}
          setAddressInput={setAddressInput}
          disabled={isBusy}
          saveDisabled={!addressInput || isBusy || !hasResolver}
          saveLabel={saveLabel}
          onSave={onSave}
        />
        <PrimaryNameRow
          isPrimary={isPrimary}
          address={address}
          reverseName={reverseName}
          icon={icon}
          label={label}
        />
        {protocolVersion && (
          <div className="border-t pt-6">
            <RecentActivity
              name={name}
              protocolVersion={protocolVersion}
              eventTypes={ADDRESS_HISTORY_EVENT_TYPES}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const SET_PRIMARY_TX_ID = 'tx-forward-set-primary-name'

// Standalone ENSv1 `DefaultReverseRegistrar` on Sepolia (ENSIP-19
// `default.reverse`, coin type 0x80000000). `setName(string)` sets the caller's
// cross-chain primary name — NOT the ENSv2 permissioned-resolver path.
// TODO: Sepolia-only; move to a network-keyed source (e.g. @ens-apps/l2-primary)
// when mainnet is supported.
const DEFAULT_REVERSE_REGISTRAR_ADDRESS =
  '0x4f382928805ba0e23b30cfb75fc9e848e82dfd47' as const

/**
 * Owns the two write flows for the selected network — editing the
 * `addr(coinType)` record, and (when permitted) setting the primary name so the
 * address resolves back to this name. Both share the one transaction modal,
 * switched by `activeFlow`.
 */
const useAddressRecordEditor = (
  name: string,
  data: AddressResolutionRow | null,
  resolverAddress: Address | undefined,
) => {
  const { address: connectedAddress, isConnected } = useConnection()
  const { data: owner } = useQuery(getEnsOwnerQueryOptions({ name }))
  const queryClient = useQueryClient()
  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const {
    saveRecords,
    isWriting,
    isConfirming,
    isSyncing,
    isWrongChain,
    isSwitchingChain,
    switchToRequiredNetwork,
  } = useSaveRecords()

  // "Set primary name" sets the reverse record for the selected row's
  // namespace via `setName(string)` (which sets `msg.sender`'s own record):
  //   - Default row (0x80000000) → ENSv1 `DefaultReverseRegistrar` (default.reverse)
  //   - Mainnet row (coin 60)    → ENSv1 `ReverseRegistrar` (addr.reverse)
  // The default is the cross-chain fallback (covers L2s), but a pre-existing
  // coin-60 `addr.reverse` shadows it — so Mainnet needs its own write to
  // overwrite that record rather than being silently shadowed.
  // Offered only when the connected wallet *is* this address (setName is
  // msg.sender-scoped).
  const canSetPrimaryName =
    !!connectedAddress &&
    !!data?.address &&
    connectedAddress.toLowerCase() === data.address.toLowerCase()

  const { setReverseResolution } = useSetReverseResolution({
    chainId: sepoliaWithEns.id,
    id: SET_PRIMARY_TX_ID,
  })
  const [activeFlow, setActiveFlow] = useState<'addr' | 'primary'>('addr')

  // Re-seed the input with the selected network's current address when the
  // selected row changes — React's "adjust state during render" pattern. When
  // the record is unset, fall back to the connected wallet so owners setting
  // their own address don't have to copy-paste it. The edit UI only renders for
  // owners, so non-owners never see this default.
  const [addressInput, setAddressInput] = useState('')
  const [seededCoinType, setSeededCoinType] = useState<number | undefined>()
  if (data && seededCoinType !== data.coinType) {
    setSeededCoinType(data.coinType)
    setAddressInput(data.address ?? connectedAddress ?? '')
  }

  const isOwner =
    !!connectedAddress &&
    !!owner?.owner &&
    connectedAddress.toLowerCase() === owner.owner.toLowerCase()

  const txId = data ? `tx-set-addr-${data.coinType}` : 'tx-set-addr'
  const onTransactionDone = () => {
    closeModal()
    clearTransaction()
  }
  const onPrimaryNameDone = () => {
    // The resolved addresses didn't change — only the reverse record did — so
    // the reverse-match query key is unchanged and won't refetch on its own.
    // Invalidate it so the banner / primary-name row reflect the new state.
    queryClient.invalidateQueries({ queryKey: ['get-reverse-matches'] })
    onTransactionDone()
  }

  const startSetAddr = () => {
    if (!resolverAddress || !data) return
    const record: EditableRecord = {
      type: 'address',
      key: data.label,
      value: addressInput,
      id: data.coinType,
    }
    saveRecords({
      name,
      resolverAddress,
      // Setting a single coin record is idempotent — an empty original set
      // plus one new coin resolves to `setAddr(coinType, value)`.
      originalRecords: [],
      pendingChanges: {
        newRecords: [record],
        editedValues: new Map(),
        deletedIds: new Set(),
      },
      id: txId,
    })
  }

  const startSetPrimaryName = () => {
    // Mainnet (coin 60) writes `addr.reverse` via the ENSv1 `ReverseRegistrar`;
    // every other row writes `default.reverse` (the cross-chain fallback that
    // also covers L2s). Both are `setName(string)` on Sepolia L1.
    if (data?.coinType === MAINNET_COIN_TYPE) {
      const registrarAddress = getRegistrarAddress(60, 'sepolia')
      if (!registrarAddress) return
      setReverseResolution({
        name,
        request: {
          address: registrarAddress,
          abi: reverseRegistrarSetNameSnippet,
          functionName: 'setName',
          args: [name],
        },
      })
      return
    }
    setReverseResolution({
      name,
      request: {
        address: DEFAULT_REVERSE_REGISTRAR_ADDRESS,
        abi: defaultReverseRegistrarSetNameSnippet,
        functionName: 'setName',
        args: [name],
      },
    })
  }

  const openFlow = (flow: 'addr' | 'primary') => {
    if (isWrongChain) return switchToRequiredNetwork()
    setActiveFlow(flow)
    openModal()
  }

  const transactions =
    activeFlow === 'primary'
      ? [
          {
            id: SET_PRIMARY_TX_ID,
            title: 'Set primary name',
            transactionName: `Set ${name} as the primary name`,
            estimatedGasCost: 0.0001,
            onStart: startSetPrimaryName,
            onDone: onPrimaryNameDone,
          },
        ]
      : [
          {
            id: txId,
            title: 'Set address',
            transactionName: `Set ${data?.label ?? ''} address for ${name}`,
            estimatedGasCost: 0.0001,
            onStart: startSetAddr,
            onDone: onTransactionDone,
          },
        ]

  return {
    isOwner,
    canSetPrimaryName,
    protocolVersion: owner?.protocolVersion,
    hasResolver: !!resolverAddress,
    addressInput,
    setAddressInput,
    isBusy: isWriting || isConfirming || isSyncing || isSwitchingChain,
    saveLabel: saveButtonLabel({
      isConnected,
      isSwitchingChain,
      isWrongChain,
      isWriting: isWriting || isConfirming,
      isSyncing,
    }),
    onSave: () => {
      if (!addressInput || !resolverAddress) return
      openFlow('addr')
    },
    onSetPrimaryName: () => openFlow('primary'),
    transactions,
  }
}

/**
 * Sheet for a single network's forward resolution. Editing writes the
 * `addr(coinType)` record for the connected name owner.
 *
 * `TransactionModal` is a sibling of `SheetContent` (never nested inside it),
 * mirroring `ReverseResolutionSidebar`.
 */
export const AddressResolutionSidebar: FC<
  PropsWithChildren<{
    row: Row<AddressResolutionRow> | null
    name: string
    resolverAddress: Address | undefined
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  }>
> = ({ children, row, name, resolverAddress, open, setOpen }) => {
  const isMobile = useIsMobile()
  const data = row?.original ?? null
  const editor = useAddressRecordEditor(name, data, resolverAddress)

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-background overflow-y-auto"
      >
        {data ? (
          <ResolutionDetails
            row={data}
            name={name}
            address={data.address}
            isOwner={editor.isOwner}
            addressInput={editor.addressInput}
            setAddressInput={editor.setAddressInput}
            isBusy={editor.isBusy}
            hasResolver={editor.hasResolver}
            saveLabel={editor.saveLabel}
            onSave={editor.onSave}
            protocolVersion={editor.protocolVersion}
            canSetPrimaryName={editor.canSetPrimaryName}
            onSetPrimaryName={editor.onSetPrimaryName}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-center py-12">
            No resolution selected
          </div>
        )}
      </SheetContent>
      <TransactionModal transactions={editor.transactions} />
    </Sheet>
  )
}
