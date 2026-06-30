import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useRecipientResolution } from '../hooks/useRecipientResolution'
import { useTransferName } from '../hooks/useTransferName'
import type { TransferOptions } from '../utils/buildTransferPlan'

type SendNameFormProps = {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
  readonly currentResolverAddress: Address | undefined
}

type OptionConfig = {
  readonly key: keyof TransferOptions
  readonly label: string
}

const OPTIONS: readonly OptionConfig[] = [
  {
    key: 'setDefaultAddress',
    label: 'Set the default address to the recipient',
  },
  {
    key: 'deployResolver',
    label: 'Deploy a new resolver',
  },
  {
    key: 'deployRegistry',
    label: 'Deploy a new registry',
  },
]

export const SendNameForm = ({
  name,
  registryAddress,
  owner,
  currentResolverAddress,
}: SendNameFormProps) => {
  const [recipientInput, setRecipientInput] = useState('')
  const [options, setOptions] = useState<TransferOptions>({
    setDefaultAddress: false,
    deployResolver: false,
    deployRegistry: false,
  })

  const {
    address: recipient,
    isResolving,
    error: resolveError,
  } = useRecipientResolution(recipientInput)

  const { openModal } = useTransactionModal()
  const { startTransfer, transactions, isPreparing, prepError } =
    useTransferName({ name, registryAddress, owner })

  const isSelf = !!recipient && isAddressEqual(recipient, owner)

  const needsResolverForDefaultAddress =
    options.setDefaultAddress &&
    !options.deployResolver &&
    !currentResolverAddress

  const canStart =
    !!recipient &&
    !isSelf &&
    !isResolving &&
    !needsResolverForDefaultAddress &&
    !isPreparing

  const toggleOption = (key: keyof TransferOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleStart = async () => {
    if (!recipient) return
    const ready = await startTransfer({
      recipient,
      currentResolverAddress,
      options,
    })
    if (ready) openModal()
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl w-full">
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription>
          Transferring ownership of an ENS name is irreversible. Make sure you
          check the recipient address before proceeding.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-1">
        <span className="font-medium">Recipient</span>
        <Input
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
          placeholder="ENS name or address"
          autoComplete="off"
          spellCheck={false}
          className="h-9"
        />
        <div className="text-sm">
          {isResolving && (
            <span className="text-muted-foreground">Resolving…</span>
          )}
          {!isResolving && resolveError && (
            <span className="text-destructive">{resolveError}</span>
          )}
          {!isResolving && recipient && isSelf && (
            <span className="text-destructive">
              The recipient already owns this name.
            </span>
          )}
          {!isResolving && recipient && !isSelf && (
            <RecipientPreview address={recipient} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {OPTIONS.map((option) => (
          <label
            key={option.key}
            htmlFor={`transfer-option-${option.key}`}
            className="flex flex-col items-start justify-between cursor-pointer"
          >
            <span className="text-foreground font-medium">{option.label}</span>
            <Switch
              id={`transfer-option-${option.key}`}
              checked={options[option.key]}
              onCheckedChange={() => toggleOption(option.key)}
              className="mt-1 shrink-0"
            />
          </label>
        ))}
        {needsResolverForDefaultAddress && (
          <span className="text-destructive text-sm">
            This name has no resolver. Enable “Deploy a new resolver” to set the
            default address.
          </span>
        )}
      </div>

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

      <TransactionModal transactions={transactions} />
    </div>
  )
}

const RecipientPreview = ({ address }: { address: Address }) => {
  const { data: primaryName } = useQuery(getPrimaryNameQueryOptions(address))

  return (
    <div className="flex bg-muted items-center gap-3 rounded-sm p-2.5">
      <NameAvatar
        name={primaryName ?? address}
        width="48px"
        height="48px"
        rounded="rounded-sm"
      />
      <div className="flex flex-col min-w-0">
        {primaryName && (
          <CopyableRecord value={primaryName} textClassName="text-foreground" />
        )}
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
