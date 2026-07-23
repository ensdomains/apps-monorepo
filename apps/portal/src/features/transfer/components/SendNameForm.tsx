import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
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
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransferName } from '../hooks/useTransferName'
import type { TransferOptions } from '../utils/buildTransferPlan'

type SendNameFormProps = {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
}

type OptionConfig = {
  readonly key: keyof TransferOptions
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
  const [options, setOptions] = useState<TransferOptions>({
    resetResolver: true,
    resetRegistry: true,
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // `useNameResolverAddress` already maps empty/zero → null, so a truthy check is
  // enough. `getNameRegistries` returns the name's own subregistry at [0] (or the
  // zero address when unset), so that one still needs an explicit zero check.
  const resolverQuery = useNameResolverAddress({ name })
  const registriesQuery = useQuery(getNameRegistriesQueryOptions({ name }))
  const subregistryAddress = registriesQuery.data?.[0]
  const hasResolver = !!resolverQuery.data
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress

  const resolution = useAddressResolution(recipientInput)
  const { address: recipient, isResolving } = resolution

  const { startTransfer, transactions, isPreparing, prepError } =
    useTransferName({ name, registryAddress, owner })

  const isSelf = !!recipient && isAddressEqual(recipient, owner)
  const isZeroAddress = !!recipient && isAddressEqual(recipient, zeroAddress)
  const hasValidRecipient = !!recipient && !isSelf && !isZeroAddress

  // A reset option only appears once we've confirmed the name actually has that
  // target set — nothing to reset means nothing to show, and we stay hidden
  // while the lookup is in flight rather than flashing a row we may remove.
  const optionIsVisible: Record<keyof TransferOptions, boolean> = {
    resetResolver: !resolverQuery.isLoading && hasResolver,
    resetRegistry: !registriesQuery.isLoading && hasSubregistry,
  }

  // A hidden option never contributes to the plan, regardless of its stored
  // toggle value, so fold visibility into the options we hand off.
  const effectiveOptions: TransferOptions = {
    resetResolver: options.resetResolver && optionIsVisible.resetResolver,
    resetRegistry: options.resetRegistry && optionIsVisible.resetRegistry,
  }

  const visibleOptions = OPTIONS.filter((option) => optionIsVisible[option.key])

  const resetTargetsSettled =
    !resolverQuery.isLoading && !registriesQuery.isLoading

  const canStart =
    hasValidRecipient && !isResolving && !isPreparing && resetTargetsSettled

  const keepsResolver = optionIsVisible.resetResolver && !options.resetResolver
  const keepsRegistry = optionIsVisible.resetRegistry && !options.resetRegistry
  const needsConfirmation = keepsResolver || keepsRegistry

  const toggleOption = (key: keyof TransferOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const runTransfer = () => {
    if (!recipient) return
    startTransfer({ recipient, options: effectiveOptions })
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

      {prepError && (
        <span className="text-destructive text-sm">{prepError.message}</span>
      )}

      <TransferConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        keepsResolver={keepsResolver}
        keepsRegistry={keepsRegistry}
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
  readonly options: TransferOptions
  readonly visibleOptions: readonly OptionConfig[]
  readonly onToggle: (key: keyof TransferOptions) => void
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
  onConfirm,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly keepsResolver: boolean
  readonly keepsRegistry: boolean
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
        <li>
          You may keep permission to edit this name’s records after the
          transfer, since {keepsResolver ? 'the resolver' : 'the registry'}{' '}
          stays under your control.
        </li>
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
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Back
        </Button>
        <Button variant="default" onClick={onConfirm}>
          Transfer anyway
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
