import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useRecipientResolution } from '../hooks/useRecipientResolution'
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
    resetResolver: false,
    resetRegistry: false,
  })

  // `useNameResolverAddress` already maps empty/zero → null, so a truthy check is
  // enough. `getNameRegistries` returns the name's own subregistry at [0] (or the
  // zero address when unset), so that one still needs an explicit zero check.
  const resolverQuery = useNameResolverAddress({ name })
  const registriesQuery = useQuery(getNameRegistriesQueryOptions({ name }))
  const subregistryAddress = registriesQuery.data?.[0]
  const hasResolver = !!resolverQuery.data
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress

  const {
    address: recipient,
    isResolving,
    error: resolveError,
  } = useRecipientResolution(recipientInput)

  const { openModal } = useTransactionModal()
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

  const canStart = hasValidRecipient && !isResolving && !isPreparing

  const toggleOption = (key: keyof TransferOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleStart = async () => {
    if (!recipient) return
    const ready = await startTransfer({ recipient, options: effectiveOptions })
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
          {match({
            isResolving,
            resolveError,
            recipient,
            isSelf,
            isZeroAddress,
          })
            .with({ isResolving: true }, () => (
              <span className="text-muted-foreground">Resolving…</span>
            ))
            .with({ resolveError: P.string }, ({ resolveError }) => (
              <span className="text-destructive">{resolveError}</span>
            ))
            .with({ recipient: P.nonNullable, isSelf: true }, () => (
              <span className="text-destructive">
                The recipient already owns this name.
              </span>
            ))
            .with({ recipient: P.nonNullable, isZeroAddress: true }, () => (
              <span className="text-destructive">
                Can’t transfer to the zero address.
              </span>
            ))
            .with({ recipient: P.nonNullable }, ({ recipient }) => (
              <RecipientPreview address={recipient} />
            ))
            .otherwise(() => null)}
        </div>
      </div>

      {hasValidRecipient && visibleOptions.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleOptions.map((option) => (
            <label
              key={option.key}
              htmlFor={`transfer-option-${option.key}`}
              className="flex items-start justify-between gap-3 cursor-pointer"
            >
              <span className="flex flex-col">
                <span className="text-foreground font-medium">
                  {option.label}
                </span>
                <span className="text-muted-foreground text-sm">
                  {option.description}
                </span>
              </span>
              <Switch
                id={`transfer-option-${option.key}`}
                checked={options[option.key]}
                onCheckedChange={() => toggleOption(option.key)}
                className="mt-1 shrink-0"
              />
            </label>
          ))}
        </div>
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

      <TransactionModal transactions={transactions} />
    </div>
  )
}

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
