import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
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
  readonly description: string
}

const OPTIONS: readonly OptionConfig[] = [
  {
    key: 'setDefaultAddress',
    label: 'Set the default address to the recipient',
    description:
      "Update the name's ETH address record to point at the recipient so it resolves to them.",
  },
  {
    key: 'deployResolver',
    label: 'Deploy a new resolver',
    description:
      'Deploy a fresh dedicated resolver admin’d by the recipient and point the name at it.',
  },
  {
    key: 'deployRegistry',
    label: 'Deploy a new registry',
    description:
      'Deploy a fresh subregistry admin’d by the recipient and point the name at it.',
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
  const { startTransfer, transactions, isPreparing, prepError, hasFlow } =
    useTransferName({ name, registryAddress, owner })

  const isSelf = !!recipient && isAddressEqual(recipient, owner)

  // The default-address step needs a resolver. If the name has none, the user
  // must also deploy one in the same flow.
  const needsResolverForDefaultAddress =
    options.setDefaultAddress &&
    !options.deployResolver &&
    !currentResolverAddress

  const canStart =
    !!recipient &&
    !isSelf &&
    !isResolving &&
    !needsResolverForDefaultAddress &&
    !isPreparing &&
    !hasFlow

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
          Transferring a name hands over ownership of the ERC-1155 token to the
          recipient. This cannot be undone - only the new owner can transfer it
          back.
        </AlertDescription>
      </Alert>

      {/* Recipient */}
      <div className="flex flex-col gap-1">
        <span className="font-medium">Recipient</span>
        <Input
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
          placeholder="ENS name or address"
          disabled={hasFlow}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="min-h-5 text-sm">
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
            <span className="text-muted-foreground font-mono">
              {truncateAddress(recipient)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {OPTIONS.map((option) => (
          <label
            key={option.key}
            htmlFor={`transfer-option-${option.key}`}
            className="flex gap-3 items-start justify-between cursor-pointer"
          >
            <span className="flex flex-col">
              <span className="text-foreground">{option.label}</span>
              <span className="text-muted-foreground text-sm">
                {option.description}
              </span>
            </span>
            <Switch
              id={`transfer-option-${option.key}`}
              checked={options[option.key]}
              disabled={hasFlow}
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
        {isPreparing ? 'Preparing…' : 'Transfer'}
      </Button>

      {prepError && (
        <span className="text-destructive text-sm">{prepError.message}</span>
      )}

      <TransactionModal transactions={transactions} />
    </div>
  )
}
