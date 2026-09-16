import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AddressNameInput } from '@/features/address/components/AddressNameInput'
import { useAddressResolution } from '@/features/address/hooks/useAddressResolution'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import type { TransferControls } from '../hooks/useTransferName'
import type {
  ParentWarning,
  RegistryDetachImpact,
  TransferDetachTargets,
  TransferOptionKey,
} from '../types'
import type { TransferOptions } from '../utils/buildTransferPlan'

/**
 * The transfer form, protocol-agnostic. Everything that depends on how the name
 * is held — which options exist, what the parent can still do, which contracts
 * the steps call — is computed by a per-protocol container (`V2SendName`,
 * `V1SendName`) and handed in. This component only owns the recipient input,
 * the option toggles and the modal.
 */
type SendNameFormProps = {
  /** The connected wallet doing the sending. */
  readonly owner: Address
  readonly detachTargets: TransferDetachTargets
  /** Null when the name has no parent worth warning about (a 2LD). */
  readonly parentWarning: ParentWarning | null
  /** V2 only: what detaching the registry would break. Null when there's no such step. */
  readonly registryDetachImpact?: RegistryDetachImpact | null
  readonly transfer: TransferControls
  /** Protocol-specific notices, rendered under the irreversibility warning. */
  readonly notices?: ReactNode
}

type OptionConfig = {
  readonly key: TransferOptionKey
  readonly label: string
  readonly description: string
  /**
   * Shown right below the toggle when it's turned off. Omitted for options
   * whose off state is the safe one — there is nothing to warn about.
   */
  readonly warning?: string
}

const OPTIONS: readonly OptionConfig[] = [
  {
    key: 'setEthAddress',
    label: 'Set the ETH address to the recipient',
    description:
      'Points this name’s ETH address record at the recipient, so it can no longer resolve to you.',
    warning:
      'This name’s ETH address will keep pointing to you after the transfer, so you could re-set it as your primary name. Turn this on to point it at the recipient instead.',
  },
  {
    key: 'detachResolver',
    label: 'Detach the resolver',
    description:
      'Detaches this name’s resolver so it stops resolving to your records entirely. The recipient starts clean and sets up their own.',
    warning:
      'This name’s other records will keep resolving after the transfer. Until the recipient updates them, it could still be listed as the primary name for an address that no longer controls it.',
  },
  {
    key: 'detachRegistry',
    label: 'Detach the registry',
    description:
      'Points this name away from its registry. Every subname under it — including any owned by other people — stops resolving, and they can’t undo it. Leave this off unless you know the registry is empty or yours.',
  },
]

/**
 * What the parent owner can still do to this subname, stated only where the
 * container says they can do it. Renders nothing when the parent holds no
 * power: such a subname transfers as finally as a 2LD, and warning about it
 * would be false.
 */
const ParentWarningAlert = ({
  warning,
}: {
  readonly warning: ParentWarning
}) => {
  const { parentName, parentIsSelf, powers, isLoading, isError } = warning

  // Nothing is claimed until the reads land: an alert that appears and then
  // rewrites itself is worse than one that arrives a beat late.
  if (isLoading) return null

  const parent = <span className="font-medium inline-block">{parentName}</span>

  // Unknown, not absent — the reads failed, so the powers stay unlisted and the
  // sender is told the check itself didn't complete.
  if (isError)
    return (
      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertDescription>
          <p>
            This is a subname of {parent}. We couldn't check what its owner can
            still do to it, so treat this transfer as reversible by them: a
            parent can hold authority that lets them reclaim or re-issue a
            subname.
          </p>
        </AlertDescription>
      </Alert>
    )

  if (powers.length === 0) return null

  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        <p>
          This is a subname of {parent}
          {parentIsSelf
            ? ', which you own, so you keep authority over it — you can '
            : ', and its owner keeps authority over it — they can '}
          {powers.length === 1 ? (
            powers[0]
          ) : (
            <>
              {powers.slice(0, -1).join('; ')}; and {powers.at(-1)}
            </>
          )}
          .{' '}
          {parentIsSelf
            ? `This transfer isn't final the way transferring ${parentName} itself would be.`
            : `Transferring it doesn't give the recipient what owning ${parentName} would.`}
        </p>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Whether the detach has to be signed off, and whether that sign-off is still
 * outstanding. `impact` is null when the step isn't in the plan.
 *
 * An unknown blast radius (still counting, or the count failed) needs consent
 * like a known one — and can't be given it, so the transfer stays blocked until
 * the count lands. Split out only to keep the form under the complexity limit.
 */
const getDetachConsentState = (
  impact: RegistryDetachImpact | null,
  isAcknowledged: boolean,
) =>
  match(impact)
    .with(null, () => ({ needsConsent: false, isBlocked: false }))
    // Nothing to lose, so nothing to sign off.
    .with({ status: 'ready', subnameCount: 0 }, () => ({
      needsConsent: false,
      isBlocked: false,
    }))
    // An unsized radius needs consent like a sized one — and can't be given it,
    // so the transfer stays blocked until the count lands.
    .with({ status: P.union('pending', 'error') }, () => ({
      needsConsent: true,
      isBlocked: true,
    }))
    .otherwise(() => ({ needsConsent: true, isBlocked: !isAcknowledged }))

export const SendNameForm = ({
  owner,
  detachTargets,
  parentWarning,
  registryDetachImpact = null,
  transfer,
  notices,
}: SendNameFormProps) => {
  const [recipientInput, setRecipientInput] = useState('')
  const [options, setOptions] = useState<Record<TransferOptionKey, boolean>>({
    setEthAddress: true,
    detachResolver: true,
    // Off by default: unlike the other two, this step's damage lands on people
    // who aren't party to the transfer. Nobody's routine transfer should break
    // a stranger's subname because a toggle shipped on.
    detachRegistry: false,
  })
  const [hasAcknowledgedDetach, setHasAcknowledgedDetach] = useState(false)

  const { isOptionVisible, isSettled, hasFailed } = detachTargets

  const resolution = useAddressResolution(recipientInput)
  const { address: recipient, isResolving } = resolution

  const { startTransfer, transactions, isPreparing, prepError } = transfer

  const isSelf = !!recipient && isAddressEqual(recipient, owner)
  const isZeroAddress = !!recipient && isAddressEqual(recipient, zeroAddress)
  const hasValidRecipient = !!recipient && !isSelf && !isZeroAddress

  // A hidden option never contributes to the plan, whatever its stored value.
  const effectiveOptions: TransferOptions = {
    setEthAddress: options.setEthAddress && isOptionVisible.setEthAddress,
    detachResolver: options.detachResolver && isOptionVisible.detachResolver,
    detachRegistry: options.detachRegistry && isOptionVisible.detachRegistry,
  }

  const visibleOptions = OPTIONS.filter((option) => isOptionVisible[option.key])

  const { needsConsent: needsDetachConsent, isBlocked: isDetachBlocked } =
    getDetachConsentState(
      effectiveOptions.detachRegistry ? registryDetachImpact : null,
      hasAcknowledgedDetach,
    )

  const canStart =
    hasValidRecipient &&
    !isResolving &&
    !isPreparing &&
    isSettled &&
    !parentWarning?.isLoading &&
    !isDetachBlocked

  const toggleOption = (key: TransferOptionKey) => {
    // Consent is given for one specific plan; turning the step off and on again
    // must ask again rather than carry a stale tick forward.
    if (key === 'detachRegistry') setHasAcknowledgedDetach(false)
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const runTransfer = () => {
    if (!recipient || !canStart) return
    startTransfer({ recipient, options: effectiveOptions })
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

      {notices}

      {parentWarning && <ParentWarningAlert warning={parentWarning} />}

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
        <TransferDetachOptions
          options={options}
          visibleOptions={visibleOptions}
          onToggle={toggleOption}
        />
      )}

      {needsDetachConsent && registryDetachImpact && (
        <RegistryDetachConsent
          impact={registryDetachImpact}
          isAcknowledged={hasAcknowledgedDetach}
          onAcknowledge={setHasAcknowledgedDetach}
        />
      )}

      <Button
        variant="default"
        onClick={runTransfer}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-fit"
      >
        {isPreparing ? 'Preparing…' : 'Transfer name'}
      </Button>

      {hasValidRecipient && hasFailed && (
        <span className="text-destructive text-sm">
          Couldn’t check this name’s current resolver and registry. Refresh and
          try again before transferring.
        </span>
      )}

      {prepError && (
        <span className="text-destructive text-sm">{prepError.message}</span>
      )}

      <TransactionModal transactions={transactions} />
    </div>
  )
}

/**
 * The separate, explicit sign-off for detaching a registry that has something
 * in it. Deliberately not a toggle description: the toggle says what the step
 * does, this says who it happens to and how many of them there are, and the
 * transfer button stays disabled until it is ticked.
 *
 * Only rendered when the step is on and there is something to lose — see
 * `needsDetachConsent`.
 */
const RegistryDetachConsent = ({
  impact,
  isAcknowledged,
  onAcknowledge,
}: {
  readonly impact: RegistryDetachImpact
  readonly isAcknowledged: boolean
  readonly onAcknowledge: (value: boolean) => void
}) =>
  match(impact)
    .with({ status: 'pending' }, () => (
      <Alert variant="warning">
        <AlertTriangle className="size-4" />
        <AlertDescription>
          Checking how many subnames detaching the registry would break…
        </AlertDescription>
      </Alert>
    ))
    .with({ status: 'error' }, () => (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription>
          We couldn’t check how many subnames detaching the registry would
          break, so we can’t let it run. Turn the option off to transfer, or
          refresh and try again.
        </AlertDescription>
      </Alert>
    ))
    .with({ status: 'ready' }, ({ subnameCount, hasThirdPartySubnames }) => {
      const countLabel = `${subnameCount} subname${subnameCount === 1 ? '' : 's'}`

      return (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Detaching the registry will stop{' '}
              <span className="font-medium">{countLabel}</span> under this name
              from resolving.{' '}
              {hasThirdPartySubnames
                ? 'Some of them belong to other people. They aren’t part of this transfer, won’t be told, and can’t repair it — only whoever ends up owning this name can.'
                : 'The subnames stay in the old registry but nothing points at them any more.'}
            </p>
            <label
              htmlFor="transfer-detach-registry-ack"
              className="flex items-start gap-2 cursor-pointer"
            >
              <Checkbox
                id="transfer-detach-registry-ack"
                checked={isAcknowledged}
                onCheckedChange={(checked) => onAcknowledge(checked === true)}
                className="mt-0.5 shrink-0"
              />
              <span>
                I understand this breaks {countLabel}
                {hasThirdPartySubnames ? ', including ones I don’t own' : ''}.
              </span>
            </label>
          </AlertDescription>
        </Alert>
      )
    })
    .exhaustive()

const TransferDetachOptions = ({
  options,
  visibleOptions,
  onToggle,
}: {
  readonly options: Record<TransferOptionKey, boolean>
  readonly visibleOptions: readonly OptionConfig[]
  readonly onToggle: (key: TransferOptionKey) => void
}) => {
  if (visibleOptions.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {visibleOptions.map((option) => {
        const disabled =
          option.key === 'setEthAddress' && options.detachResolver

        return (
          <div key={option.key} className="flex flex-col gap-2">
            <label
              htmlFor={`transfer-option-${option.key}`}
              className={`flex items-start justify-between gap-3 ${
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <span className="flex flex-col">
                <span className="text-foreground font-medium">
                  {option.label}
                </span>
                <span className="text-muted-foreground text-sm">
                  {disabled
                    ? 'Not needed while the resolver is being detached.'
                    : option.description}
                </span>
              </span>
              <Switch
                id={`transfer-option-${option.key}`}
                checked={options[option.key]}
                onCheckedChange={() => onToggle(option.key)}
                disabled={disabled}
                className="mt-1 shrink-0"
              />
            </label>

            {!disabled && !options[option.key] && option.warning && (
              <Alert variant="warning">
                <AlertTriangle className="size-4" />
                <AlertDescription>{option.warning}</AlertDescription>
              </Alert>
            )}
          </div>
        )
      })}
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
