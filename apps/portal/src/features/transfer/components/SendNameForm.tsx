import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AddressNameInput } from '@/features/address/components/AddressNameInput'
import { useAddressResolution } from '@/features/address/hooks/useAddressResolution'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import {
  getUnsetPrimaryTargets,
  unsetPrimaryTargetsQueryKey,
} from '../helpers/unsetPrimaryName'
import { useTransferName } from '../hooks/useTransferName'
import { useTransferResetTargets } from '../hooks/useTransferResetTargets'
import type { TransferOptions } from '../utils/buildTransferPlan'

type SendNameFormProps = {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
}

type ResetToggleKey = 'resetResolver' | 'resetRegistry'

type OptionConfig = {
  readonly key: ResetToggleKey
  readonly label: string
  readonly description: string
}

const OPTIONS: readonly OptionConfig[] = [
  {
    key: 'resetResolver',
    label: 'Reset the resolver',
    description:
      'Removes this name’s resolver so it stops resolving to your records. The recipient starts clean and sets up their own.',
  },
  {
    key: 'resetRegistry',
    label: 'Reset the registry',
    description:
      'Detaches this name’s registry so its subnames stop resolving. The recipient starts clean and deploys their own.',
  },
]

export const SendNameForm = ({
  name,
  registryAddress,
  owner,
}: SendNameFormProps) => {
  const [recipientInput, setRecipientInput] = useState('')
  const [options, setOptions] = useState<Record<ResetToggleKey, boolean>>({
    resetResolver: true,
    resetRegistry: true,
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {
    optionIsVisible,
    settled: resetTargetsSettled,
    failed: resetTargetsFailed,
  } = useTransferResetTargets({ name })

  const unsetTargetsQuery = useQuery({
    queryKey: unsetPrimaryTargetsQueryKey(owner, name),
    queryFn: () => getUnsetPrimaryTargets({ owner, name }),
  })
  const willUnsetPrimary =
    !!unsetTargetsQuery.data &&
    (unsetTargetsQuery.data.clearDefault || unsetTargetsQuery.data.clearReverse)

  const resolution = useAddressResolution(recipientInput)
  const { address: recipient, isResolving } = resolution

  const { startTransfer, transactions, isPreparing, prepError } =
    useTransferName({ name, registryAddress, owner })

  const isSelf = !!recipient && isAddressEqual(recipient, owner)
  const isZeroAddress = !!recipient && isAddressEqual(recipient, zeroAddress)
  const hasValidRecipient = !!recipient && !isSelf && !isZeroAddress

  // A hidden option never contributes to the plan, regardless of its stored
  // toggle value, so fold visibility into the options we hand off.
  const effectiveOptions: TransferOptions = {
    resetResolver: options.resetResolver && optionIsVisible.resetResolver,
    resetRegistry: options.resetRegistry && optionIsVisible.resetRegistry,
  }

  const visibleOptions = OPTIONS.filter((option) => optionIsVisible[option.key])

  // Fail-closed on reverse discovery: a flaky L1 reverse lookup blocks *all*
  // transfers, not only primary ones. Prefer that over transferring while
  // possibly leaving a stale reverse record (the bug this flow exists to fix).
  const canStart =
    hasValidRecipient &&
    !isResolving &&
    !isPreparing &&
    resetTargetsSettled &&
    unsetTargetsQuery.isSuccess

  const keepsResolver = optionIsVisible.resetResolver && !options.resetResolver
  const keepsRegistry = optionIsVisible.resetRegistry && !options.resetRegistry
  const needsConfirmation = keepsResolver || keepsRegistry

  const toggleOption = (key: ResetToggleKey) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const runTransfer = () => {
    if (!recipient || !resetTargetsSettled || !unsetTargetsQuery.data) return
    startTransfer({
      recipient,
      options: effectiveOptions,
      unsetTargets: unsetTargetsQuery.data,
    })
  }

  const handleStart = () => {
    if (!recipient) return
    if (needsConfirmation) {
      setConfirmOpen(true)
      return
    }
    runTransfer()
  }

  const handleConfirmProceed = () => {
    setConfirmOpen(false)
    runTransfer()
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl w-full">
      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertDescription>
          Transferring ownership of an ENS name is irreversible. Make sure you
          check the recipient address before proceeding.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-1">
        <span className="font-medium">Recipient</span>
        <AddressNameInput
          value={recipientInput}
          onChange={setRecipientInput}
          resolution={resolution}
          className="h-9"
          resolvedContent={
            <RecipientResolvedContent
              recipient={recipient}
              isSelf={isSelf}
              isZeroAddress={isZeroAddress}
            />
          }
        />
      </div>

      {hasValidRecipient && willUnsetPrimary && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            This is your primary name. Transferring it will unset it as your
            primary name so your address no longer reverse-resolves to it.
          </AlertDescription>
        </Alert>
      )}

      {hasValidRecipient && (
        <TransferResetOptions
          options={options}
          visibleOptions={visibleOptions}
          onToggle={toggleOption}
        />
      )}

      <Button
        variant="default"
        onClick={handleStart}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-fit"
      >
        {isPreparing ? 'Preparing…' : 'Transfer name'}
      </Button>

      {hasValidRecipient && resetTargetsFailed && (
        <span className="text-destructive text-sm">
          Couldn’t check this name’s current resolver and registry. Refresh and
          try again before transferring.
        </span>
      )}

      {hasValidRecipient && unsetTargetsQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Couldn’t check whether this name is your primary name. Refresh and
            try again before transferring.
          </AlertDescription>
        </Alert>
      )}

      {prepError && (
        <span className="text-destructive text-sm">{prepError.message}</span>
      )}

      <TransferConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        keepsResolver={keepsResolver}
        keepsRegistry={keepsRegistry}
        isPreparing={isPreparing}
        onConfirm={handleConfirmProceed}
      />

      <TransactionModal transactions={transactions} />
    </div>
  )
}

const TransferResetOptions = ({
  options,
  visibleOptions,
  onToggle,
}: {
  readonly options: Record<ResetToggleKey, boolean>
  readonly visibleOptions: readonly OptionConfig[]
  readonly onToggle: (key: ResetToggleKey) => void
}) => {
  if (visibleOptions.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {visibleOptions.map((option) => (
        <label
          key={option.key}
          htmlFor={`transfer-option-${option.key}`}
          className="flex items-start justify-between gap-3 cursor-pointer"
        >
          <span className="flex flex-col">
            <span className="text-foreground font-medium">{option.label}</span>
            <span className="text-muted-foreground text-sm">
              {option.description}
            </span>
          </span>
          <Switch
            id={`transfer-option-${option.key}`}
            checked={options[option.key]}
            onCheckedChange={() => onToggle(option.key)}
            className="mt-1 shrink-0"
          />
        </label>
      ))}
    </div>
  )
}

const RecipientResolvedContent = ({
  recipient,
  isSelf,
  isZeroAddress,
}: {
  readonly recipient: Address | null
  readonly isSelf: boolean
  readonly isZeroAddress: boolean
}) =>
  match({ recipient, isSelf, isZeroAddress })
    .with({ isSelf: true }, () => (
      <p className="text-sm mt-1.5 text-destructive">
        The recipient already owns this name.
      </p>
    ))
    .with({ isZeroAddress: true }, () => (
      <p className="text-sm mt-1.5 text-destructive">
        Can’t transfer to the zero address.
      </p>
    ))
    .with({ recipient: P.nonNullable }, ({ recipient }) => (
      <RecipientPreview address={recipient} />
    ))
    .otherwise(() => null)

const TransferConfirmDialog = ({
  open,
  onOpenChange,
  keepsResolver,
  keepsRegistry,
  isPreparing,
  onConfirm,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly keepsResolver: boolean
  readonly keepsRegistry: boolean
  readonly isPreparing: boolean
  readonly onConfirm: () => void
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Transfer without resetting?</DialogTitle>
        <DialogDescription>
          You’ve chosen to leave{' '}
          {match({ keepsResolver, keepsRegistry })
            .with({ keepsResolver: true, keepsRegistry: true }, () => (
              <>this name’s resolver and registry</>
            ))
            .with({ keepsResolver: true }, () => <>this name’s resolver</>)
            .otherwise(() => (
              <>this name’s registry</>
            ))}{' '}
          in place. Before you continue, note that:
        </DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-2 text-sm text-muted-foreground list-disc pl-5">
        {keepsResolver && (
          <li>
            You may keep permission to edit this name’s records after the
            transfer, since the resolver stays under your control.
          </li>
        )}
        {keepsRegistry && (
          <li>
            You may keep control of this name’s subnames after the transfer,
            since the registry stays under your control.
          </li>
        )}
        <li>
          The recipient may need to deploy their own{' '}
          {match({ keepsResolver, keepsRegistry })
            .with({ keepsResolver: true, keepsRegistry: true }, () => (
              <>resolver and registry</>
            ))
            .with({ keepsResolver: true }, () => <>resolver</>)
            .otherwise(() => (
              <>registry</>
            ))}{' '}
          before they can edit records or set this name as their primary name.
        </li>
      </ul>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPreparing}
        >
          Back
        </Button>
        <Button variant="default" onClick={onConfirm} disabled={isPreparing}>
          {isPreparing ? 'Preparing…' : 'Transfer anyway'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

const RecipientPreview = ({ address }: { address: Address }) => {
  const { data: primaryName, isLoading } = useQuery(
    getPrimaryNameQueryOptions(address),
  )

  return (
    <div className="flex bg-muted items-center gap-3 rounded-sm p-2.5">
      {isLoading ? (
        <Skeleton className="size-12 rounded-sm shrink-0" />
      ) : (
        <NameAvatar
          name={primaryName ?? address}
          width="48px"
          height="48px"
          rounded="rounded-sm"
        />
      )}
      <div className="flex flex-col gap-1 min-w-0">
        {match(primaryName)
          .with(P.string.minLength(1), (value) => (
            <CopyableRecord value={value} textClassName="text-foreground" />
          ))
          .otherwise(() => null)}
        <CopyableRecord
          value={address}
          displayValue={address}
          textClassName="text-muted-foreground sm:text-xs"
          truncate={false}
        />
      </div>
    </div>
  )
}
