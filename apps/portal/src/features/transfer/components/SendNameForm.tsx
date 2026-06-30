import { AlertTriangle, CheckCircle, Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { useRecipientResolution } from '../hooks/useRecipientResolution'
import { useTransferName } from '../hooks/useTransferName'
import {
  buildTransferPlan,
  getTransferStepLabel,
  type TransferOptions,
  type TransferStepKind,
} from '../utils/buildTransferPlan'

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
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {
    address: recipient,
    isResolving,
    error: resolveError,
  } = useRecipientResolution(recipientInput)

  const { startTransfer, status, plan, currentStep, error, goToOwnership } =
    useTransferName({ name, registryAddress, owner })

  const isSelf = !!recipient && recipient.toLowerCase() === owner.toLowerCase()
  const isRunning = status === 'running'

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
    !isRunning

  const toggleOption = (key: keyof TransferOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const previewPlan = buildTransferPlan(options)

  const handleConfirm = async () => {
    if (!recipient) return
    setConfirmOpen(false)
    await startTransfer({
      recipient,
      currentResolverAddress,
      options,
    })
  }

  if (status === 'success') {
    return (
      <TransferSuccess
        name={name}
        recipient={recipient}
        onBack={goToOwnership}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl w-full">
      <div className="bg-muted rounded-sm p-6 flex gap-4 items-start">
        <AlertTriangle className="w-8 h-8 shrink-0" />
        <p className="text-foreground">
          Transferring a name hands over ownership of the ERC-1155 token to the
          recipient. This cannot be undone — only the new owner can transfer it
          back.
        </p>
      </div>

      {/* Recipient */}
      <div className="flex flex-col gap-1">
        <span className="font-medium">Recipient</span>
        <Input
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
          placeholder="ENS name or address"
          disabled={isRunning}
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

      {/* Options */}
      <div className="flex flex-col gap-3">
        <span className="font-medium">Options</span>
        {OPTIONS.map((option) => (
          <label
            key={option.key}
            htmlFor={`transfer-option-${option.key}`}
            className="flex gap-3 items-start cursor-pointer"
          >
            <Checkbox
              id={`transfer-option-${option.key}`}
              checked={options[option.key]}
              disabled={isRunning}
              onCheckedChange={() => toggleOption(option.key)}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="text-foreground">{option.label}</span>
              <span className="text-muted-foreground text-sm">
                {option.description}
              </span>
            </span>
          </label>
        ))}
        {needsResolverForDefaultAddress && (
          <span className="text-destructive text-sm">
            This name has no resolver. Enable “Deploy a new resolver” to set the
            default address.
          </span>
        )}
      </div>

      {(isRunning || status === 'error') && (
        <TransferProgress
          plan={plan}
          currentStep={currentStep}
          isRunning={isRunning}
          error={status === 'error' ? error : null}
        />
      )}

      <Button
        variant="default"
        onClick={() => setConfirmOpen(true)}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-fit"
      >
        <Send className="w-4 h-4" />
        {isRunning ? 'Transferring…' : 'Start transfer'}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogDescription>
              {recipient && (
                <>
                  Transfer <strong>{name}</strong> to{' '}
                  <span className="font-mono">
                    {truncateAddress(recipient)}
                  </span>
                  . You’ll be asked to sign {previewPlan.length} transaction
                  {previewPlan.length === 1 ? '' : 's'}:
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-1 list-decimal list-inside text-sm">
            {previewPlan.map((step) => (
              <li key={step}>{getTransferStepLabel(step)}</li>
            ))}
          </ol>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleConfirm}>
              Confirm transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const TransferSuccess = ({
  name,
  recipient,
  onBack,
}: {
  name: string
  recipient: Address | null
  onBack: () => void
}) => (
  <div className="flex flex-col gap-4 items-start">
    <div className="flex items-center gap-2 text-foreground">
      <CheckCircle className="w-6 h-6" />
      <p className="font-medium">Transfer submitted</p>
    </div>
    <p className="text-muted-foreground text-sm">
      {recipient && (
        <>
          <strong>{name}</strong> is being transferred to{' '}
          <span className="font-mono">{truncateAddress(recipient)}</span>.
          Ownership will update once the network confirms.
        </>
      )}
    </p>
    <Button variant="default" onClick={onBack}>
      Back to ownership
    </Button>
  </div>
)

const TransferProgress = ({
  plan,
  currentStep,
  isRunning,
  error,
}: {
  plan: readonly TransferStepKind[]
  currentStep: number
  isRunning: boolean
  error: Error | null
}) => (
  <div className="flex flex-col gap-2 border border-border rounded p-4">
    {plan.map((step, index) => {
      const done = index < currentStep
      const active = index === currentStep && isRunning
      return (
        <div key={step} className="flex items-center gap-2 text-sm">
          {done ? (
            <CheckCircle className="w-4 h-4 text-foreground" />
          ) : active ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="w-4 h-4 rounded-full border border-border" />
          )}
          <span
            className={
              done || active ? 'text-foreground' : 'text-muted-foreground'
            }
          >
            {getTransferStepLabel(step)}
          </span>
        </div>
      )
    })}
    {error && (
      <span className="text-destructive text-sm mt-2">{error.message}</span>
    )}
  </div>
)
