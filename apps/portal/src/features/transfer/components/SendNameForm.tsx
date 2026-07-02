import { addrPart, computeResolverResource } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, namehash, zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
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
  readonly description: string
}

const OPTIONS: readonly OptionConfig[] = [
  {
    key: 'setDefaultAddress',
    label: 'Set the default address to the recipient',
    description:
      'Points the name’s ETH address at the recipient so it resolves to them right after the transfer.',
  },
  {
    key: 'deployResolver',
    label: 'Deploy a new resolver',
    description:
      'Gives the recipient a fresh resolver they fully control. This name’s current records aren’t carried over.',
  },
  {
    key: 'deployRegistry',
    label: 'Deploy a new registry',
    description:
      'Gives the recipient a fresh registry to manage subnames. Existing subnames aren’t carried over.',
  },
]

const getSetDefaultDisabledReason = ({
  deployResolver,
  hasResolver,
  canEdit,
}: {
  deployResolver: boolean
  hasResolver: boolean
  canEdit: boolean | undefined
}): string | null =>
  match({ deployResolver, hasResolver, canEdit })
    .with(
      { deployResolver: true },
      () =>
        'Can’t set the address on a resolver you’re handing to the recipient — turn off “Deploy a new resolver”.',
    )
    .with(
      { hasResolver: false },
      () => 'This name has no resolver to set an address on.',
    )
    .with(
      { canEdit: false },
      () =>
        'You don’t control this name’s resolver, so you can’t set its address.',
    )
    .otherwise(() => null)

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
  const hasValidRecipient = !!recipient && !isSelf

  const ethAddrRecord = computeResolverResource(namehash(name), addrPart(60n))

  const { data: canEditCurrentResolver } = useQuery({
    ...getHasRolesQueryOptions({
      resolverAddress: currentResolverAddress ?? zeroAddress,
      resource: ethAddrRecord,
      roles: ['ROLE_SET_ADDR'],
      account: owner,
    }),
    enabled: !!currentResolverAddress,
  })

  // "Set default address" writes to the *current* resolver, so it can't be
  // combined with deploying a new (recipient-owned) one, and only works if the
  // sender controls that resolver.
  const setDefaultDisabledReason = getSetDefaultDisabledReason({
    deployResolver: options.deployResolver,
    hasResolver: !!currentResolverAddress,
    canEdit: canEditCurrentResolver,
  })
  const setDefaultDisabled = setDefaultDisabledReason !== null
  const effectiveSetDefault = options.setDefaultAddress && !setDefaultDisabled

  const effectiveOptions: TransferOptions = {
    ...options,
    setDefaultAddress: effectiveSetDefault,
  }

  const canStart = hasValidRecipient && !isResolving && !isPreparing

  const toggleOption = (key: keyof TransferOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleStart = async () => {
    if (!recipient) return
    const ready = await startTransfer({
      recipient,
      currentResolverAddress,
      options: effectiveOptions,
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
          {match({ isResolving, resolveError, recipient, isSelf })
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
            .with({ recipient: P.nonNullable }, ({ recipient }) => (
              <RecipientPreview address={recipient} />
            ))
            .otherwise(() => null)}
        </div>
      </div>

      {hasValidRecipient && (
        <div className="flex flex-col gap-3">
          {OPTIONS.map((option) => {
            const isSetDefault = option.key === 'setDefaultAddress'
            const disabled = isSetDefault && setDefaultDisabled
            const checked = isSetDefault
              ? effectiveSetDefault
              : options[option.key]
            return (
              <div key={option.key} className="flex flex-col gap-1">
                <label
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
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggleOption(option.key)}
                    className="mt-1 shrink-0"
                  />
                </label>
                {isSetDefault && setDefaultDisabledReason && (
                  <span className="text-muted-foreground text-sm">
                    {setDefaultDisabledReason}
                  </span>
                )}
              </div>
            )
          })}
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
