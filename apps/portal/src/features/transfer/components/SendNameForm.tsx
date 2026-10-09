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
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type {
  RecordAheadOfMove,
  TransferControls,
} from '../hooks/useTransferName'
import type {
  NameRoleGrant,
  ParentWarning,
  RegistryDetachImpact,
  TransferDetachTargets,
  TransferOptionKey,
  TransferRoleRevocations,
} from '../types'
import type { TransferOptions } from '../utils/buildTransferPlan'

/**
 * What a protocol without registry roles reports: nothing held, nothing to
 * revoke, nothing outstanding. A V1 name has no EAC resource at all, so this is
 * the settled answer rather than a placeholder for one still loading.
 */
const NO_ROLE_REVOCATIONS: TransferRoleRevocations = {
  status: 'ready',
  holders: [],
  revocable: [],
  unrevocable: [],
}

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
  /**
   * V2 only: who else holds roles on the name, and which of those the sender
   * can revoke. Defaults to the empty settled answer for protocols that have no
   * registry roles.
   */
  readonly roleRevocations?: TransferRoleRevocations
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
  {
    key: 'revokeRoles',
    label: 'Revoke everyone else’s permissions',
    description:
      'Takes back the permissions you granted other accounts on this name. They are held on the name itself, not on the token, so they survive the transfer unless you revoke them first.',
    warning:
      'The accounts listed below keep their permissions on this name after the transfer. They hold no part of it, but they can still act on it — repointing its resolver, for instance — until the recipient revokes them.',
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
 * Identifies the exact claim the sender is asked to sign off: this registry,
 * this many names, these owners. Used as the acknowledgement's key rather than
 * a bare boolean, so a tick can never carry over to a different claim — if the
 * pointer moves or the counts change under the form, consent is void and the
 * sender is asked again.
 */
const getDetachConsentKey = (impact: RegistryDetachImpact | null) =>
  impact?.status === 'ready' && impact.countedRegistry !== null
    ? `${impact.countedRegistry}:${impact.subnameCount}:${impact.hasThirdPartySubnames}`
    : null

/**
 * Whether the detach has to be signed off, and whether that sign-off is still
 * outstanding. `impact` is null when the step isn't in the plan. Split out only
 * to keep the form under the complexity limit.
 */
const getDetachConsentState = (
  impact: RegistryDetachImpact | null,
  acknowledgedFor: string | null,
) =>
  match(impact)
    .with(null, () => ({ needsConsent: false, isBlocked: false }))
    // Ordered ahead of the zero-count arm on purpose: a retained zero is a
    // number like any other, and "empty" is exactly the cached answer that
    // would wave the detach through after someone registered a subname.
    // Mid-revalidation the visible numbers are the previous answer; signing off
    // on them would approve a count the write may no longer match.
    .with({ status: 'ready', isRevalidating: true }, () => ({
      needsConsent: true,
      isBlocked: true,
    }))
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
    .otherwise((impact) => ({
      needsConsent: true,
      isBlocked: getDetachConsentKey(impact) !== acknowledgedFor,
    }))

/**
 * What the sender's toggles actually mean once visibility is applied: a hidden
 * option never contributes to the plan, whatever its stored value.
 *
 * Split out to keep the form under the complexity limit, like
 * `getDetachConsentState`.
 */
const resolveOptions = ({
  options,
  detachVisibility,
  hasRoleHolders,
}: {
  readonly options: Record<TransferOptionKey, boolean>
  readonly detachVisibility: TransferDetachTargets['isOptionVisible']
  readonly hasRoleHolders: boolean
}) => {
  const visibility: Record<TransferOptionKey, boolean> = {
    ...detachVisibility,
    revokeRoles: hasRoleHolders,
  }

  const effective: TransferOptions = {
    setEthAddress: options.setEthAddress && visibility.setEthAddress,
    detachResolver: options.detachResolver && visibility.detachResolver,
    detachRegistry: options.detachRegistry && visibility.detachRegistry,
    revokeRoles: options.revokeRoles && visibility.revokeRoles,
  }

  return {
    effective,
    visibleOptions: OPTIONS.filter((option) => visibility[option.key]),
  }
}

/**
 * What the plan does about the name's other role holders. Split out to keep
 * the form under the complexity limit, like `resolveOptions`.
 */
const resolveRolePlan = (
  revocations: TransferRoleRevocations,
  shouldRevoke: boolean,
) => {
  if (revocations.status !== 'ready')
    return { roleGrants: [], hasRemainingRoleHolders: false }

  return {
    // Only the grants the sender holds the admin role for; the rest can't be
    // revoked by this wallet and are called out separately instead.
    roleGrants: shouldRevoke ? revocations.revocable : [],
    // Whoever is left once those revokes land: everyone when the option is
    // off, the grants this wallet can't revoke when it is on. The registry
    // refuses a plain transfer while any remain, so the plan has to know.
    hasRemainingRoleHolders:
      (shouldRevoke ? revocations.unrevocable : revocations.holders).length > 0,
  }
}

export const SendNameForm = ({
  owner,
  detachTargets,
  parentWarning,
  registryDetachImpact = null,
  roleRevocations = NO_ROLE_REVOCATIONS,
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
    // On by default, like the other cleanup steps: a grant left behind is a
    // live write authority over a name its holder no longer has any stake in.
    revokeRoles: true,
  })
  // What was acknowledged, not merely that something was — see
  // `getDetachConsentKey`.
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null)

  const { isOptionVisible, isSettled, hasFailed } = detachTargets

  // Only offered once we know there is someone to revoke. Until then the
  // option stays hidden *and* `canStart` blocks, so an unread answer can never
  // pass for "nobody else holds roles" and transfer the grants along with the
  // name.
  const hasRoleHolders =
    roleRevocations.status === 'ready' && roleRevocations.holders.length > 0

  const resolution = useAddressResolution(recipientInput)
  const { address: recipient, isResolving } = resolution

  const {
    startTransfer,
    discardPreparation,
    transactions,
    isPreparing,
    prepError,
    recordAheadOfMove,
    restoreEthAddress,
  } = transfer

  const isSelf = !!recipient && isAddressEqual(recipient, owner)
  const isZeroAddress = !!recipient && isAddressEqual(recipient, zeroAddress)
  const hasValidRecipient = !!recipient && !isSelf && !isZeroAddress

  const { effective: effectiveOptions, visibleOptions } = resolveOptions({
    options,
    detachVisibility: isOptionVisible,
    hasRoleHolders,
  })

  const { roleGrants, hasRemainingRoleHolders } = resolveRolePlan(
    roleRevocations,
    effectiveOptions.revokeRoles,
  )

  const { needsConsent: needsDetachConsent, isBlocked: isDetachBlocked } =
    getDetachConsentState(
      effectiveOptions.detachRegistry ? registryDetachImpact : null,
      acknowledgedFor,
    )

  const canStart =
    hasValidRecipient &&
    !isResolving &&
    !isPreparing &&
    isSettled &&
    roleRevocations.status === 'ready' &&
    !parentWarning?.isLoading &&
    !isDetachBlocked

  // Any edit invalidates whatever was prepared from the previous values. The
  // inputs are also locked while preparing, so this is the backstop for the
  // case where the modal was closed and the plan behind it is now stale.
  const toggleOption = (key: TransferOptionKey) => {
    discardPreparation()
    // Consent is given for one specific plan; turning the step off and on again
    // must ask again rather than carry a stale tick forward.
    if (key === 'detachRegistry') setAcknowledgedFor(null)
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const runTransfer = () => {
    if (!recipient || !canStart) return
    startTransfer({
      recipientInput: recipientInput.trim(),
      recipient,
      options: effectiveOptions,
      roleGrants,
      hasRemainingRoleHolders,
    })
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
          onChange={(value) => {
            discardPreparation()
            setRecipientInput(value)
          }}
          resolution={resolution}
          disabled={isPreparing}
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

      <RecordAheadOfMoveAlert
        state={recordAheadOfMove}
        onRestore={restoreEthAddress}
      />

      {hasValidRecipient && (
        <TransferDetachOptions
          options={options}
          visibleOptions={visibleOptions}
          isResolverDetaching={effectiveOptions.detachResolver}
          onToggle={toggleOption}
          isLocked={isPreparing}
          roleHolders={
            <RoleHolderList revocations={roleRevocations} owner={owner} />
          }
        />
      )}

      {needsDetachConsent && registryDetachImpact && (
        <RegistryDetachConsent
          impact={registryDetachImpact}
          isAcknowledged={
            getDetachConsentKey(registryDetachImpact) === acknowledgedFor
          }
          onAcknowledge={(checked) =>
            setAcknowledgedFor(
              checked ? getDetachConsentKey(registryDetachImpact) : null,
            )
          }
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

      {hasValidRecipient && roleRevocations.status === 'error' && (
        <span className="text-destructive text-sm">
          Couldn’t check who else holds permissions on this name, so we can’t
          tell whether transferring it would leave any behind. Refresh and try
          again.
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
    // A re-check in flight reads the same as a first read: the counts on screen
    // are provisional either way, so don't state them as fact.
    .with(
      { status: 'pending' },
      { status: 'ready', isRevalidating: true },
      () => (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Checking how many subnames detaching the registry would break…
          </AlertDescription>
        </Alert>
      ),
    )
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

/**
 * Shown after a flow whose ETH address repoint landed but whose move didn't —
 * a rejected wallet prompt, or a recipient that refused the token once the
 * record was already written. States what is true on-chain now, and offers to
 * put the record back.
 */
const RecordAheadOfMoveAlert = ({
  state,
  onRestore,
}: {
  readonly state: RecordAheadOfMove | null
  readonly onRestore: () => void
}) => {
  if (!state) return null
  const { recipient, previousEthAddress } = state

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertDescription className="flex flex-col gap-3">
        <p>
          The transfer didn’t go through, so you still own this name — but its
          ETH address was already changed and now points to{' '}
          <span className="font-mono break-all">{recipient}</span>.
        </p>
        {previousEthAddress ? (
          <>
            <p>
              Restore it to{' '}
              <span className="font-mono break-all">{previousEthAddress}</span>,
              or try the transfer again.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onRestore}
              className="w-fit"
            >
              Restore ETH address
            </Button>
          </>
        ) : (
          <p>Update it from this name’s records, or try the transfer again.</p>
        )}
      </AlertDescription>
    </Alert>
  )
}

const TransferDetachOptions = ({
  options,
  visibleOptions,
  isResolverDetaching,
  onToggle,
  isLocked,
  roleHolders,
}: {
  readonly options: Record<TransferOptionKey, boolean>
  readonly visibleOptions: readonly OptionConfig[]
  /** The detach is actually in the plan — not merely toggled on while hidden. */
  readonly isResolverDetaching: boolean
  readonly onToggle: (key: TransferOptionKey) => void
  /** Locks every switch, e.g. while a plan is being prepared from them. */
  readonly isLocked: boolean
  /** Rendered under the `revokeRoles` toggle, whichever way it is set. */
  readonly roleHolders: ReactNode
}) => {
  if (visibleOptions.length === 0) return null

  // The name has a resolver of its own with records we can write, yet the
  // detach isn't on offer: the sender lacks the authority for it (V2
  // ROLE_SET_RESOLVER, a burned CANNOT_SET_RESOLVER fuse).
  const offered = new Set(visibleOptions.map(({ key }) => key))
  const isResolverLocked =
    offered.has('setEthAddress') && !offered.has('detachResolver')

  return (
    <div className="flex flex-col gap-4">
      {isResolverLocked && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Your wallet isn’t allowed to detach this name’s resolver, so it
            stays attached and its other records keep resolving after the
            transfer.
          </AlertDescription>
        </Alert>
      )}
      {visibleOptions.map((option) => {
        // Keyed off the plan, not the stored toggle: a hidden detach defaults to
        // on, and claiming it covers the ETH address would hide a real write.
        const isRedundant =
          option.key === 'setEthAddress' && isResolverDetaching
        const isDisabled = isRedundant || isLocked

        return (
          <div key={option.key} className="flex flex-col gap-2">
            <label
              htmlFor={`transfer-option-${option.key}`}
              className={`flex items-start justify-between gap-3 ${
                isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <span className="flex flex-col">
                <span className="text-foreground font-medium">
                  {option.label}
                </span>
                <span className="text-muted-foreground text-sm">
                  {isRedundant
                    ? 'Not needed while the resolver is being detached.'
                    : option.description}
                </span>
              </span>
              <Switch
                id={`transfer-option-${option.key}`}
                checked={options[option.key]}
                onCheckedChange={() => onToggle(option.key)}
                disabled={isDisabled}
                className="mt-1 shrink-0"
              />
            </label>

            {option.key === 'revokeRoles' && roleHolders}

            {!isDisabled && !options[option.key] && option.warning && (
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

/** One account and the permissions it holds on the name, as a single line. */
const RoleHolderLine = ({ grant }: { readonly grant: NameRoleGrant }) => (
  <li className="flex flex-col">
    <span className="text-foreground font-medium">
      {truncateAddress(grant.account)}
    </span>
    <span className="text-muted-foreground">
      {grant.roles.map(formatRoleLabel).join(', ')}
    </span>
  </li>
)

/**
 * Names the accounts the revoke step is about. Shown whether the toggle is on
 * or off: off, it is the list of who keeps authority over the name; on, it is
 * what the extra transactions will do.
 *
 * Grants this wallet holds no admin role for get their own alert, because no
 * setting here removes them — the revoke would revert — and the sender should
 * hear that before the token moves rather than from the recipient afterwards.
 */
const RoleHolderList = ({
  revocations,
  owner,
}: {
  readonly revocations: TransferRoleRevocations
  readonly owner: Address
}) => {
  if (revocations.status !== 'ready' || revocations.holders.length === 0)
    return null

  const { revocable, unrevocable } = revocations

  return (
    <div className="flex flex-col gap-2">
      {revocable.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {revocable.map((grant) => (
            <RoleHolderLine key={`revocable-${grant.account}`} grant={grant} />
          ))}
        </ul>
      )}

      {unrevocable.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {truncateAddress(owner)} doesn’t hold the admin permission for
              these grants, so they can’t be revoked from here and will outlive
              the transfer whichever way you set this:
            </p>
            <ul className="flex flex-col gap-2">
              {unrevocable.map((grant) => (
                <RoleHolderLine
                  key={`unrevocable-${grant.account}`}
                  grant={grant}
                />
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
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
      <p className="text-p mt-1.5 text-destructive">
        The recipient already owns this name.
      </p>
    ))
    .with({ isZeroAddress: true }, () => (
      <p className="text-p mt-1.5 text-destructive">
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
          textClassName="text-muted-foreground sm:text-xs break-all"
          truncate={false}
        />
      </div>
    </div>
  )
}
