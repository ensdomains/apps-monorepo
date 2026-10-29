import { TaggedError } from '@ens-apps/utils/neverthrow'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { type ReactNode, useState } from 'react'
import { match, P } from 'ts-pattern'
import { isAddressEqual } from 'viem'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Switch } from '@/components/ui/switch'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import { type SUPPORTED_TOKEN, type TOKEN_SYMBOL, TOKENS } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { getRegistrationV2AvailabilityQueryOptions } from '../../../data/queries/availability.query'
import {
  getHcaBudgetQueryOptions,
  isHcaBudgetQuoteRequired,
} from '../../../data/queries/hcaBudget.query'
import { getRegisterPriceQueryOptions } from '../../../data/queries/pricing.query'
import { getManagerRegistrationPostRegistrationSetup } from '../../../state/registrationAutoSetup'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import type { FundingSourceOrigin } from '../../../state/registrationUi.machine'
import { useRegistrationLockHeartbeat } from '../../registering/hooks/useRegistrationLockHeartbeat'
import { useAutoSelectOnlyToken } from '../hooks/useAutoSelectOnlyToken'
import { useFallbackPaymentChoice } from '../hooks/useFallbackPaymentChoice'
import {
  canPayFromL2,
  type L2PaymentProps,
  type L2PaymentRow,
  useL2Payment,
} from '../hooks/useL2Payment'
import {
  type CurrentMethodState,
  getFallbackPaymentChoice,
  type PayableMethod,
} from '../lib/fallbackPaymentChoice'
import { getPaymentBreakdownFigures } from '../lib/paymentBreakdownFigures'
import {
  getPaymentReceiptFigures,
  getPaymentReceiptState,
  getWalletShortfall,
} from '../lib/paymentReceiptFigures'
import { getPremiumLabel } from '../lib/premiumLabel'
import { computeRegistrationFunding } from '../lib/registrationFunding'
import {
  getEstimatedL2AmountIn,
  getL2SelectionMessage,
  isL2ShortOfFunds,
  L2SourceListItem,
} from './L2SourceListItem'
import { PaymentAction } from './PaymentAction'
import {
  PaymentMethodList,
  type PaymentMethodListItem,
} from './PaymentMethodList'
import { PaymentReceipt } from './PaymentReceipt'
import { PriceCooldownPill } from './PriceCooldownPill'
import { TokenListItem } from './TokenListItem'

const MEDIUM_NAME_CHAR_THRESHOLD = 10
const LONG_NAME_CHAR_THRESHOLD = 43

const USDC_DECIMALS = TOKENS.USDC.decimals

/** Raised when the wallet cannot cover the funding budget. */
class InsufficientFundingError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super('Insufficient USDC to fund the registration')
    this.name = 'InsufficientFundingError'
  }
}

/**
 * The funding budget could not be quoted. Not a funding failure, but still a
 * hard stop: the only figure left is the rent, which is less than the permit
 * must cover, so proceeding strands a paid-for commitment (Immunefi #93021).
 */
class BudgetQuoteUnavailableError extends TaggedError(
  'BudgetQuoteUnavailableError',
)<{
  cause: unknown
}> {}

/**
 * What the wallet is actually debited, itemised — `rent + networkFee` on the
 * standalone-HCA route. See {@link computeRegistrationFunding}.
 */
export type RegistrationFundingSummary = {
  /** The registrar's charge for the name, the first line of the breakdown. */
  readonly registration: number
  readonly networkFee: number
  /** What the registration costs — the figure shown on the total row. */
  readonly total: number
  /**
   * What the HCA still holds from an earlier attempt and applies to this one.
   * Zero in the common case; above zero it is shown as a deduction and the
   * headline becomes what the wallet pays now.
   */
  readonly hcaCredit: number
  /**
   * What the wallet must hold: `total` less anything the HCA already carries.
   * This, not `total`, is what the affordability gates compare against.
   */
  readonly walletDebit: number
  /** The method-level fee quote is still being refreshed. */
  readonly isLoading: boolean
}

const getDomainSizeClasses = (domainName: string): string => {
  const charCount = Array.from(domainName).length
  if (charCount > LONG_NAME_CHAR_THRESHOLD) return 'text-[22px]'
  if (charCount >= MEDIUM_NAME_CHAR_THRESHOLD) return 'text-[32px]'
  return 'text-[40px]'
}

const PaymentMethods = <T extends TOKEN_SYMBOL>({
  showNetworkFeeDetails,
  paymentMethodItems,
  stablecoinBalances,
  onSelectCoin,
  selectedToken,
  walletShareOf,
}: {
  readonly showNetworkFeeDetails: boolean
  readonly paymentMethodItems: readonly PaymentMethodListItem[]
  readonly stablecoinBalances: readonly StablecoinBalance[]
  readonly onSelectCoin: (coin: T) => void
  readonly selectedToken: T | undefined
  /** What the wallet must cover in a coin; `undefined` until it is priced. */
  readonly walletShareOf: (symbol: string) => number | undefined
}) => {
  if (showNetworkFeeDetails) {
    return <PaymentMethodList items={paymentMethodItems} />
  }

  return (
    <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
      {stablecoinBalances.map((stablecoin) => (
        <TokenListItem
          key={stablecoin.address}
          onSelectCoin={onSelectCoin}
          priceUSD={walletShareOf(stablecoin.symbol) ?? 0}
          selectedCoin={selectedToken}
          stablecoin={stablecoin}
        />
      ))}
    </div>
  )
}

export const TokenPickerContent = () => {
  const { t } = useLingui()
  const { label, uiActor, registrationActor } = useRegistrationV2Context()
  const approvalState = useSelector(uiActor, (state) => ({
    isApproving: state.matches({ pricing: 'approving' }),
    approvalOutcome: state.context.approvalOutcome,
    errorMessage: state.context.lastErrorMessage,
    ownerAddress: state.context.confirmedData?.ownerAddress,
    hasConfirmedData: !!state.context.confirmedData,
    setAsPrimary:
      !!state.context.hcaPrimaryName ||
      state.context.postRegistrationSetup?.primaryName?.enabled === true,
  }))
  const isAwaitingPaymentApproval = useSelector(
    registrationActor,
    (state) =>
      state?.matches('signingFundingPermit') ||
      state?.matches('approvingToken') ||
      // Paid from an L2, the wallet signs that payment instead.
      state?.matches('bridgingFromL2'),
  )
  useRegistrationLockHeartbeat(
    approvalState.isApproving ? approvalState.ownerAddress : undefined,
    `${label}.eth`,
  )
  const account = useSmartAccountContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const domainName = `${label}.eth`
  const [duration, selectedToken, fundingSourceChainId, fundingSourceOrigin] =
    useSelector(
      uiActor,
      (state) =>
        [
          state.context.duration,
          state.context.selectedToken,
          state.context.fundingSourceChainId,
          state.context.fundingSourceOrigin,
        ] as const,
    )
  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(
      label,
      duration,
      selectedToken ?? TOKENS.USDC.symbol,
    ),
    enabled: selectedToken !== undefined,
    select: (data) => ({
      basePriceNumber: decimalBigintToNumber(
        data.basePrice,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      premiumPriceNumber: decimalBigintToNumber(
        data.premium,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      totalPriceNumber: decimalBigintToNumber(
        data.basePrice + data.premium,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
      rawPrice: data.basePrice + data.premium,
    }),
  })

  const onSelectCoin = (coin: SUPPORTED_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  // The wallet's USDC balance. This is the EOA owner's balance (see
  // `useSmartAccountBalances`), which is the account the funding permit debits.
  //
  // Matched on {@link HCA_PAYMENT_TOKEN} — the manifest funding token, and the
  // same constant the balance list is built from, so the two cannot drift into
  // a lookup that never matches and reads as "no balance".
  const usdcBalanceRaw = (() => {
    const entry = account.stablecoinBalances.find((balance) =>
      isAddressEqual(balance.address, HCA_PAYMENT_TOKEN),
    )
    return entry ? BigInt(entry.balance) : null
  })()

  // Eligibility lookups run in the background (best-effort): they only seed the
  // default state of the primary-name toggle, so a slow/failed indexer never
  // blocks starting the registration.
  const existingPrimaryNameQuery = useQuery(
    profileReverseNameQuery(account.ownerAddress ?? undefined),
  )
  const ownedNamesCountQuery = useQuery(
    ownedNamesCountQueryOptions(account.ownerAddress ?? undefined),
  )

  // Auto-set is the default only when the wallet is eligible (no primary name
  // yet and fewer than 5 owned names). The user can always override via the
  // toggle, including turning it on to replace an existing primary name.
  const defaultSetAsPrimary = !!getManagerRegistrationPostRegistrationSetup({
    ownerAddress: account.ownerAddress,
    existingPrimaryName: existingPrimaryNameQuery.data,
    ownedNamesCount: ownedNamesCountQuery.data,
  })
  const [setPrimaryChoice, setSetPrimaryChoice] = useState<boolean | null>(
    () => (approvalState.hasConfirmedData ? approvalState.setAsPrimary : null),
  )
  const setAsPrimary = approvalState.isApproving
    ? approvalState.setAsPrimary
    : (setPrimaryChoice ?? defaultSetAsPrimary)

  // Quoted AFTER the toggle resolves, because the opt-in is priced in: it adds
  // a call to the reveal leg and widens that leg's gas limit, and the rail
  // prices the intent purely on gas units. Mirrors what
  // `registrationUi.machine.ts` hands the machine for `START_REGISTRATION`, so
  // the figure on this screen is the one the permit is sized from. Quoting
  // without it under-funds and the permit preflight then rejects a wallet this
  // screen just told the user was sufficient.
  const budgetQueryParams = {
    label,
    durationInSeconds: duration,
    hca: account.accountAddress,
    signer: account.signer,
    primaryName: setAsPrimary ? domainName : undefined,
    getSessionEnablePayload: account.getSessionEnablePayload,
  }
  const budgetQueryOptions = getHcaBudgetQueryOptions(budgetQueryParams)
  const budgetQuery = useQuery(budgetQueryOptions)

  // The EOA route needs no budget and must not be gated on a quote it never
  // takes; on the HCA route a missing quote blocks rather than falling back to
  // the rent, which is not what the wallet pays.
  const isBudgetRequired = isHcaBudgetQuoteRequired(budgetQueryParams)
  const hasBudgetQuoteFailed = isBudgetRequired && budgetQuery.isError

  // Absent until the quote lands, and permanently absent if it fails.
  const funding = computeRegistrationFunding({
    budget: budgetQuery.data,
    ...(budgetQuery.data ? { hcaBalanceRaw: budgetQuery.data.hcaBalance } : {}),
    decimals: USDC_DECIMALS,
  })

  const l2Payment = useL2Payment({
    uiActor,
    owner: account.ownerAddress,
    // What an L2 payment is quoted into; the EOA route has no HCA.
    hca:
      account.signer?.type === 'rhinestone' && account.accountAddress
        ? {
            address: account.accountAddress,
            config: account.signer.account.config,
          }
        : undefined,
    budget: budgetQuery.data,
    isQuoteStale: budgetQuery.isPlaceholderData,
    isEnabled: isBudgetRequired,
    fundingSourceChainId,
    fundingSourceOrigin,
  })
  const l2FundingChainId = l2Payment?.selectedChainId
  const isPaidFromL2 = l2FundingChainId !== undefined
  const displayedL2Charge = getSelectedL2(l2Payment)?.amountInRaw

  // An explicit toggle choice always wins. Otherwise resolve the eligibility
  // lookups (already in flight for the toggle default — fetchQuery dedupes)
  // so a click that lands before they settle still auto-sets correctly. A
  // failed lookup skips the auto-setup rather than blocking registration.
  const resolveSetAsPrimary = async (): Promise<boolean> => {
    if (setPrimaryChoice !== null) return setPrimaryChoice
    if (!account.ownerAddress) return false
    try {
      const [existingPrimaryName, ownedNamesCount] = await Promise.all([
        queryClient.fetchQuery(profileReverseNameQuery(account.ownerAddress)),
        queryClient.fetchQuery(
          ownedNamesCountQueryOptions(account.ownerAddress),
        ),
      ])
      return !!getManagerRegistrationPostRegistrationSetup({
        ownerAddress: account.ownerAddress,
        existingPrimaryName,
        ownedNamesCount,
      })
    } catch {
      return false
    }
  }

  const { referrer } = useSearch({ strict: false })

  // Dispatch `registration.start`. The smart-session gate runs UP FRONT (in
  // PaymentCard, before this chooser opens), so on the HCA path a session is
  // already active here and `account.signer` carries it — no signer override
  // or enable prompt is needed at this step.
  const startRegistration = async (
    resolvedSetAsPrimary: boolean,
    pricingSnapshot: ReturnType<typeof uiActor.getSnapshot>,
  ) => {
    if (!pricingQuery.data || !selectedToken) return
    // Resolve the session-enable payload up front; both legs are signed with it.
    const hcaSessionEnable = await account.getSessionEnablePayload()
    // The availability check can finish after the user closes this dialog.
    // Reopening or changing the chooser also invalidates the old click.
    if (uiActor.getSnapshot() !== pricingSnapshot) return
    uiActor.send({
      type: 'registration.start',
      referrer,
      label,
      duration: BigInt(Math.ceil(duration)),
      token: selectedToken,
      totalPrice: pricingQuery.data.rawPrice,
      account,
      hcaSessionEnable,
      basePriceNumber: pricingQuery.data.basePriceNumber,
      premiumPriceNumber: pricingQuery.data.premiumPriceNumber,
      postRegistrationSetup: resolvedSetAsPrimary
        ? { primaryName: { enabled: true, syncEthRecord: true } }
        : undefined,
      // The USDC figure this screen actually rendered. The machine re-quotes
      // before sizing the permit, and refuses to prompt if that re-quote lands
      // materially above this — so what the wallet is asked to approve can
      // never diverge from what was on screen. `undefined` when the quote
      // failed and only the rent was shown; the machine's independent ceiling
      // still applies.
      ...(funding && !budgetQuery.isPlaceholderData
        ? { displayedWalletDebit: funding.walletDebitRaw }
        : {}),
      // Paid from an L2, the funding is bridged in from there, not permitted.
      ...(l2FundingChainId === undefined ? {} : { l2FundingChainId }),
      // And that L2's charge, fee included, bounds the bridge the same way.
      ...(displayedL2Charge === undefined ? {} : { displayedL2Charge }),
    })
  }

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      const pricingSnapshot = uiActor.getSnapshot()
      // Re-check funding on the click path, not just on render: the quote may
      // still have been in flight when the screen painted, and a stale budget
      // would let through exactly the registration this gate exists to stop.
      // `fetchQuery` reuses the in-flight/fresh result, so this is usually free.
      // Surfaced, not swallowed: the rent cannot fund the batch, so there is
      // nothing to fall through to. Gated because `fetchQuery` ignores
      // `enabled` and the EOA route has no signer to quote with.
      const budget = isBudgetRequired
        ? await queryClient.fetchQuery(budgetQueryOptions).catch((cause) => {
            throw new BudgetQuoteUnavailableError({ cause })
          })
        : undefined

      // Against the shortfall, not the budget: the permit tops the HCA up to
      // the budget, so an HCA still holding USDC from a prior registration
      // covers part of it and the wallet is debited only the difference.
      const walletDebitRaw = budget
        ? budget.total > budget.hcaBalance
          ? budget.total - budget.hcaBalance
          : 0n
        : null

      // A chosen L2 pays instead, so the wallet's own balance is no gate.
      if (
        !isPaidFromL2 &&
        walletDebitRaw !== null &&
        usdcBalanceRaw !== null &&
        usdcBalanceRaw < walletDebitRaw
      ) {
        throw new InsufficientFundingError(
          decimalBigintToNumber(walletDebitRaw, USDC_DECIMALS),
          decimalBigintToNumber(usdcBalanceRaw, USDC_DECIMALS),
        )
      }

      const [availability, resolvedSetAsPrimary] = await Promise.all([
        queryClient.fetchQuery({
          ...getRegistrationV2AvailabilityQueryOptions(`${label}.eth`),
          staleTime: 0,
        }),
        resolveSetAsPrimary(),
      ])
      return { availability, resolvedSetAsPrimary, pricingSnapshot }
    },
    onSuccess: async ({
      availability,
      resolvedSetAsPrimary,
      pricingSnapshot,
    }) => {
      if (!pricingQuery.data || !selectedToken) return

      if (!availability.isAvailable) {
        navigate({
          replace: true,
          to: '/$name',
          params: { name: `${label}.eth` },
        })
        return
      }

      await startRegistration(resolvedSetAsPrimary, pricingSnapshot)
    },
  })

  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()

  const revalidatedFundingError =
    availabilityMutation.error instanceof InsufficientFundingError
      ? availabilityMutation.error
      : null

  const revalidatedShortfall = getWalletShortfall(
    revalidatedFundingError?.required,
    revalidatedFundingError?.available,
  )

  const globalErrorMessage = match({
    approvalState,
    isPaidFromL2,
    hasBudgetQuoteFailed,
    mutationError: availabilityMutation.error,
    isAvailabilityError: availabilityMutation.isError,
  })
    .with(
      { approvalState: { approvalOutcome: 'rejected' } },
      () => t`Signature cancelled. You can try again.`,
    )
    // An L2 payment fails for reasons worth reading, such as one still settling.
    .with(
      {
        isPaidFromL2: true,
        approvalState: { approvalOutcome: 'failed', errorMessage: P.string },
      },
      ({ approvalState }) => approvalState.errorMessage,
    )
    .with(
      { approvalState: { approvalOutcome: 'failed' } },
      () =>
        t`We couldn't approve your payment. Please try again and approve the payment in your wallet.`,
    )
    .with(
      { approvalState: { errorMessage: P.string } },
      () => t`We couldn't start your registration. Please try again.`,
    )
    .with(
      P.union(
        { hasBudgetQuoteFailed: true },
        { mutationError: P.instanceOf(BudgetQuoteUnavailableError) },
      ),
      () => t`We couldn't calculate the total. Please try again.`,
    )
    .with(
      {
        isAvailabilityError: true,
        mutationError: P.not(P.instanceOf(InsufficientFundingError)),
      },
      () =>
        t`We couldn't confirm that ${domainName} is still available. Please try again.`,
    )
    .otherwise(() => null)

  const isBusy = availabilityMutation.isPending || approvalState.isApproving
  const isPaymentApprovalRequired = !funding || funding.walletDebitRaw > 0n
  const isQuoting = isBudgetQuoting(isBudgetRequired, budgetQuery)
  const helpMessage = match({
    isPaymentApprovalRequired,
    l2Chain: getSelectedL2(l2Payment)?.option.source.chain.name,
    signerType: account.signer?.type,
  })
    .with({ isPaymentApprovalRequired: false }, () => undefined)
    .with(
      { l2Chain: P.string },
      ({ l2Chain }) =>
        t`Your wallet will ask you to sign a payment of the amount shown on ${l2Chain}. Registration starts once it arrives.`,
    )
    .with(
      { signerType: 'rhinestone' },
      () =>
        t`Your wallet will ask you to sign a payment approval for the amount shown. This allows that USDC to pay for registration and network fees. Registration starts after you sign.`,
    )
    .otherwise(
      () =>
        t`Approve the payment in your wallet to let ENS use your selected token for registration. Registration starts after approval completes.`,
    )

  const nextMessage = match({
    isBusy,
    isAwaitingPaymentApproval,
    isPaymentApprovalRequired,
    isQuoting,
    isLoadingBalances,
    hasFunding: !!funding,
  })
    .with({ isBusy: true, isAwaitingPaymentApproval: true }, () => (
      <Trans>Signing payment approval…</Trans>
    ))
    .with({ isBusy: true }, () => <Trans>Preparing registration…</Trans>)
    .with(P.union({ isLoadingBalances: true }, { isQuoting: true }), () => (
      <Trans>Register name</Trans>
    ))
    .with({ isPaymentApprovalRequired: true, hasFunding: true }, () => (
      <Trans>Sign payment approval</Trans>
    ))
    .with({ isPaymentApprovalRequired: true }, () => (
      <Trans>Approve and register</Trans>
    ))
    .otherwise(() => <Trans>Register name</Trans>)

  return (
    <TokenPickerContentBase
      footer={
        <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-[rgb(250,250,250)] px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-ens-gray text-sm">
              <Trans>Set as primary name</Trans>
            </span>
            <span className="text-ens-gray text-xs">
              <Trans>
                Your wallet address can only have one primary name, which will
                display instead of your wallet address across apps. You'll be
                prompted to confirm this additional transaction after
                registration.
              </Trans>
            </span>
          </div>
          <Switch
            aria-label={t`Set ${domainName} as your primary name`}
            checked={setAsPrimary}
            onCheckedChange={setSetPrimaryChoice}
          />
        </div>
      }
      funding={
        funding
          ? {
              registration: funding.registration,
              networkFee: funding.networkFee,
              total: funding.total,
              walletDebit: funding.walletDebit,
              hcaCredit: funding.hcaCredit,
              isLoading: budgetQuery.isFetching,
            }
          : undefined
      }
      globalErrorMessage={globalErrorMessage}
      hasBudgetQuoteFailed={hasBudgetQuoteFailed}
      helpMessage={helpMessage}
      isBusy={isBusy}
      isConnected={isConnected}
      isInPriceCooldown={(pricingQuery.data?.premiumPriceNumber ?? 0) > 0}
      isLoadingBalances={isLoadingBalances}
      isQuoteStale={budgetQuery.isPlaceholderData}
      isQuotingFunding={
        isBudgetRequired && (budgetQuery.isFetching || budgetQuery.isPending)
      }
      l2Payment={l2Payment}
      label={label}
      nextMessage={nextMessage}
      onNext={() => availabilityMutation.mutate()}
      onRetry={() => {
        availabilityMutation.reset()
        budgetQuery.refetch()
      }}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.totalPriceNumber}
      pricingLoading={pricingQuery.isLoading}
      revalidatedShortfall={revalidatedShortfall}
      selectedToken={selectedToken}
      showNetworkFeeDetails
      stablecoinBalances={stablecoinBalances}
    />
  )
}

const getSelectedL2 = (l2Payment: L2PaymentProps | undefined) =>
  l2Payment?.rows.find(
    ({ option }) => option.source.chain.id === l2Payment.selectedChainId,
  )

/**
 * The sheet's figures when an L2 quoted at `amountInRaw` pays: it is charged
 * that, and the fee line carries whatever that takes over the name price.
 */
const getL2FundingSummary = (
  funding: RegistrationFundingSummary,
  amountInRaw: bigint,
): RegistrationFundingSummary => {
  const walletDebit = decimalBigintToNumber(amountInRaw, USDC_DECIMALS)
  const total = walletDebit + funding.hcaCredit
  return {
    ...funding,
    walletDebit,
    total,
    networkFee: total - funding.registration,
  }
}

/** A chosen L2 pays in place of the wallet, so only its own quote must cover it. */
const canPaySelection = (
  selectedL2: L2PaymentRow | undefined,
  canWalletPay: boolean,
) => (selectedL2 ? canPayFromL2(selectedL2) : canWalletPay)

/** With an L2 chosen and quoted, the sheet shows what that L2 is charged. */
const getShownFunding = (
  funding: RegistrationFundingSummary | undefined,
  selectedL2: L2PaymentRow | undefined,
) =>
  funding && selectedL2?.amountInRaw !== undefined
    ? getL2FundingSummary(funding, selectedL2.amountInRaw)
    : funding

/** Highest L2 balance first; an unread balance goes last. */
const byBalanceDescending = (a: L2PaymentRow, b: L2PaymentRow) => {
  const left = a.option.balanceRaw ?? -1n
  const right = b.option.balanceRaw ?? -1n
  if (left === right) return 0
  return right > left ? 1 : -1
}

const coversShare = (coin: StablecoinBalance, share: number | undefined) =>
  share !== undefined &&
  decimalBigintToNumber(BigInt(coin.balance), coin.decimals) >= share

const getCurrentMethodState = (
  selectedL2: L2PaymentRow | undefined,
  selectedOrigin: FundingSourceOrigin | undefined,
  walletSelection: TOKEN_SYMBOL | undefined,
  walletMethodItems: readonly PaymentMethodListItem[],
): CurrentMethodState =>
  match({ selectedL2, walletSelection })
    .with({ selectedL2: P.nonNullable }, ({ selectedL2 }) =>
      match({ isShort: isL2ShortOfFunds(selectedL2), selectedOrigin })
        .with({ isShort: true }, () => 'short' as const)
        .with({ selectedOrigin: 'fallback' }, () => 'auto' as const)
        .otherwise(() => 'payable' as const),
    )
    .with({ walletSelection: P.nullish }, () => 'none' as const)
    .otherwise(() =>
      walletMethodItems.some((item) => item.isSelected) ? 'payable' : 'short',
    )

/** Every method that can pay right now, with what it holds. */
const getPayableMethods = (
  stablecoinBalances: readonly StablecoinBalance[],
  walletShareOf: (symbol: string) => number | undefined,
  l2Rows: readonly L2PaymentRow[],
): readonly PayableMethod[] => [
  ...stablecoinBalances
    .filter((coin) => coversShare(coin, walletShareOf(coin.symbol)))
    .map((coin) => ({
      choice: { kind: 'wallet' as const, symbol: coin.symbol as TOKEN_SYMBOL },
      balanceRaw: BigInt(coin.balance),
      decimals: coin.decimals,
    })),
  ...l2Rows.flatMap((row) =>
    canPayFromL2(row) && row.option.balanceRaw !== null
      ? [
          {
            choice: {
              kind: 'l2' as const,
              chainId: row.option.source.chain.id,
            },
            balanceRaw: row.option.balanceRaw,
            decimals: USDC_DECIMALS,
          },
        ]
      : [],
  ),
]

const getL2MethodItems = (
  l2Payment: L2PaymentProps | undefined,
  selectedL2: L2PaymentRow | undefined,
  funding: RegistrationFundingSummary | undefined,
): PaymentMethodListItem[] => {
  if (!l2Payment) return []
  const estimatedAmountIn = getEstimatedL2AmountIn(l2Payment.rows)
  // A chain appears once its full quote covers it; a chosen one stays through refreshes.
  return l2Payment.rows
    .filter(
      (row) =>
        row === selectedL2 ||
        (row.amountInRaw !== undefined && !isL2ShortOfFunds(row)),
    )
    .sort(byBalanceDescending)
    .map((row) => {
      const amountIn = row.amountInRaw ?? estimatedAmountIn
      return {
        id: row.option.id,
        isSelected: row === selectedL2,
        content: (
          <L2SourceListItem
            isFeeEstimated={
              row.amountInRaw === undefined && estimatedAmountIn !== undefined
            }
            isSelected={row === selectedL2}
            networkFee={
              funding && amountIn !== undefined
                ? getPaymentBreakdownFigures(
                    getL2FundingSummary(funding, amountIn),
                  ).networkFee
                : undefined
            }
            onSelect={() => l2Payment.onSelect(row.option.source.chain.id)}
            row={row}
          />
        ),
      }
    })
}

/** A quote is pending, or a stale one (the toggle re-keyed it) is being replaced. */
const isRequotingFunding = (isQuotingFunding: boolean, isQuoteStale: boolean) =>
  isQuotingFunding || isQuoteStale

/** The button holds with a spinner while a click is in flight or the fee is being quoted. */
const isCheckoutSettling = (isBusy: boolean, isRequoting: boolean) =>
  isBusy || isRequoting

/** Waiting on the budget: the first quote (fetching or paused), a refresh, or a re-key after the toggle. */
const isBudgetQuoting = (
  isBudgetRequired: boolean,
  budgetQuery: {
    readonly isFetching: boolean
    readonly isPending: boolean
    readonly isPlaceholderData: boolean
  },
) =>
  isBudgetRequired &&
  (budgetQuery.isFetching ||
    budgetQuery.isPending ||
    budgetQuery.isPlaceholderData)

export const TokenPickerContentBase = <T extends TOKEN_SYMBOL>({
  label,
  pricingLoading,
  pricingData,
  isInPriceCooldown = false,
  selectedToken,
  globalErrorMessage,
  revalidatedShortfall,
  helpMessage,
  fullyCoveredMessage = (
    <Trans>
      No additional payment needed. Your available balance covers the total.
    </Trans>
  ),
  onSelectCoin,
  onNext,
  onRetry,
  stablecoinBalances,
  accountCredit,
  fundedAmount,
  isLoadingBalances,
  isConnected,
  nextMessage = <Trans>Register name</Trans>,
  footer,
  funding,
  isQuotingFunding = false,
  showNetworkFeeDetails = false,
  isQuoteStale = false,
  hasBudgetQuoteFailed = false,
  isBusy = false,
  canProceed = true,
  networkFeeTooltip = (
    <Trans>
      An estimate of what the two on-chain transactions that register your name
      will cost. It is collected together with the name price, in the same
      approval.
    </Trans>
  ),
  totalLabel = <Trans>Registration total</Trans>,
  isEstimate = false,
  walletDebitFor,
  l2Payment,
}: {
  readonly label: string
  readonly pricingLoading: boolean
  readonly pricingData: number | undefined
  readonly isInPriceCooldown?: boolean
  readonly selectedToken: T | undefined
  readonly globalErrorMessage?: string | null
  /** A shortfall found at click time, shown when the render saw none. */
  readonly revalidatedShortfall?: number | undefined
  readonly helpMessage?: ReactNode
  readonly fullyCoveredMessage?: ReactNode
  readonly onSelectCoin: (coin: T) => void
  readonly onNext: () => void
  readonly onRetry?: () => void
  readonly stablecoinBalances: readonly StablecoinBalance[]
  /**
   * What the smart account already holds of each coin. It pays first, so the
   * wallet only has to cover the rest.
   */
  readonly accountCredit?: Partial<Record<TOKEN_SYMBOL, number>>
  /**
   * What has to be funded before account credit, when that exceeds the price:
   * a renewal intent funds its approval's headroom as well as the rent.
   */
  readonly fundedAmount?: number
  readonly isLoadingBalances: boolean
  readonly isConnected: boolean
  readonly nextMessage?: ReactNode
  /** Optional content below the payment options (e.g. the primary-name toggle). */
  readonly footer?: ReactNode
  /**
   * Carries the funding budget used by the method-level fee disclosure and the
   * receipt. When present, `walletDebit`, not `pricingData`, is what the wallet
   * must cover.
   */
  readonly funding?: RegistrationFundingSummary
  /** The method-level fee quote is still in flight. */
  readonly isQuotingFunding?: boolean
  /** Registration-only disclosure; renewals keep their existing token row. */
  readonly showNetworkFeeDetails?: boolean
  /** A placeholder quote belongs to the previous primary-name choice. */
  readonly isQuoteStale?: boolean
  /** A required budget quote failed, so checkout must remain blocked. */
  readonly hasBudgetQuoteFailed?: boolean
  readonly isBusy?: boolean
  /** False while the caller is missing something `onNext` needs, such as the signing wallet. */
  readonly canProceed?: boolean
  /** What the wallet row's fee info explains. */
  readonly networkFeeTooltip?: ReactNode
  readonly totalLabel?: ReactNode
  /** Prefix amounts with "up to", for a total carrying approval headroom. */
  readonly isEstimate?: boolean
  /** Per-coin override of what the wallet must cover, for a fee paid in one coin and rent in another. */
  readonly walletDebitFor?: (symbol: TOKEN_SYMBOL) => number
  /** Registration only: rows that pay the registration from an L2. */
  readonly l2Payment?: L2PaymentProps
}) => {
  const { t } = useLingui()
  const domainName = `${label}.eth`
  const premiumLabel = getPremiumLabel(label.length)

  const hasBalances = (stablecoinBalances?.length || 0) > 0

  useAutoSelectOnlyToken({
    isLoadingBalances,
    onSelectCoin,
    selectedToken,
    stablecoinBalances,
  })

  // Gate on the funded amount, never the rent alone: the permit is signed for
  // `rent + networkFee`, so a wallet holding only the rent cannot pay. It is
  // the wallet's DEBIT rather than the budget, since a part-funded HCA covers
  // the remainder itself.
  const requiredAmount = funding?.walletDebit ?? fundedAmount ?? pricingData
  // The account's own balance of a coin pays first; the wallet covers the rest.
  const walletShareOf = (symbol: string) => {
    if (walletDebitFor) return walletDebitFor(symbol as TOKEN_SYMBOL)
    return requiredAmount === undefined
      ? undefined
      : Math.max(
          0,
          requiredAmount - (accountCredit?.[symbol as TOKEN_SYMBOL] ?? 0),
        )
  }

  const selectedL2 = getSelectedL2(l2Payment)
  const shownFunding = getShownFunding(funding, selectedL2)
  const displayedNetworkFee = funding
    ? getPaymentBreakdownFigures(funding).networkFee
    : undefined

  const selectedCoinBalance = stablecoinBalances?.find(
    (coin) => coin.symbol === selectedToken,
  )
  // Tested for presence, never truthiness: a debit of 0 is a legitimate state,
  // not a missing quote.
  const selectedShare =
    selectedCoinBalance && walletShareOf(selectedCoinBalance.symbol)
  const hasSufficientBalanceForSelectedCoin =
    !!selectedCoinBalance && coversShare(selectedCoinBalance, selectedShare)

  const canNext =
    isConnected &&
    canProceed &&
    !!selectedToken &&
    !pricingLoading &&
    // The fee is part of the figure being confirmed, so wait for it.
    !isQuotingFunding &&
    !isQuoteStale &&
    // Refuse rather than proceed on a figure that cannot fund the batch.
    !hasBudgetQuoteFailed &&
    canPaySelection(
      selectedL2,
      hasBalances && hasSufficientBalanceForSelectedCoin,
    )
  const walletSelection = selectedL2 ? undefined : selectedToken
  const l2MethodItems = getL2MethodItems(l2Payment, selectedL2, funding)

  const isRequoting = isRequotingFunding(isQuotingFunding, isQuoteStale)
  const isSettling = isCheckoutSettling(isBusy, isRequoting)

  const receiptFigures = getPaymentReceiptFigures({
    funding: shownFunding,
    price: fundedAmount ?? pricingData,
    accountCredit: selectedToken ? (accountCredit?.[selectedToken] ?? 0) : 0,
  })
  const receiptState = getPaymentReceiptState({
    hasQuoteFailed: hasBudgetQuoteFailed,
    // A background refetch keeps the last figures on screen.
    isLoading:
      isQuoteStale || pricingLoading || (isQuotingFunding && !shownFunding),
    figures: receiptFigures,
  })
  // Unrounded, so a sub-cent debit keeps the methods.
  const isFullyCovered =
    receiptState.status === 'ready' && selectedShare === 0 && !!walletSelection

  const walletMethodItems: PaymentMethodListItem[] = stablecoinBalances.flatMap(
    (stablecoin) => {
      const share = walletShareOf(stablecoin.symbol)
      if (share === undefined || !coversShare(stablecoin, share)) return []
      return [
        {
          id: stablecoin.address,
          isSelected: walletSelection === stablecoin.symbol,
          content: (
            <TokenListItem
              feeTooltip={networkFeeTooltip}
              isNetworkFeeLoading={isQuotingFunding || funding?.isLoading}
              networkFee={displayedNetworkFee}
              onSelectCoin={onSelectCoin}
              priceUSD={share}
              selectedCoin={walletSelection}
              showNetworkFeeDetails={showNetworkFeeDetails}
              stablecoin={stablecoin}
            />
          ),
        },
      ]
    },
  )
  const paymentMethodItems = [...walletMethodItems, ...l2MethodItems]
  const isL2Pending = !!l2Payment?.rows.some(
    (row) => row.option.status === 'loading' || row.isQuoteLoading,
  )
  // A re-quote leaves some L2s on their old quote; rank once every one has settled.
  const hasStaleL2Quote = !!l2Payment?.rows.some(
    (row) =>
      row.option.status === 'available' &&
      row.isQuoteStale &&
      !row.hasQuoteFailed,
  )
  // The selected wallet coin went short (say the primary-name re-quote) while another method can pay.
  const isWalletSelectionHidden =
    !!walletSelection &&
    receiptState.status === 'ready' &&
    paymentMethodItems.length > 0 &&
    !walletMethodItems.some((item) => item.isSelected)

  // Registration only: when the chosen method can't pay, switch to the one holding the most
  const fallbackChoice = l2Payment
    ? getFallbackPaymentChoice({
        current: getCurrentMethodState(
          selectedL2,
          l2Payment.selectedOrigin,
          walletSelection,
          walletMethodItems,
        ),
        payableMethods: getPayableMethods(
          stablecoinBalances,
          walletShareOf,
          l2Payment.rows,
        ),
      })
    : undefined
  useFallbackPaymentChoice({
    choice: fallbackChoice,
    // Never mid-click: any send invalidates the click's pricing snapshot.
    isSettled:
      isConnected &&
      !isBusy &&
      !isLoadingBalances &&
      receiptState.status === 'ready' &&
      !isRequoting &&
      !isL2Pending &&
      !hasStaleL2Quote,
    onSelectCoin,
    onSelectL2: l2Payment?.onFallbackSelect,
  })

  const warning =
    globalErrorMessage ||
    (selectedL2 &&
      getL2SelectionMessage(
        selectedL2,
        funding?.walletDebit,
        l2Payment && getEstimatedL2AmountIn(l2Payment.rows),
      )) ||
    (revalidatedShortfall !== undefined &&
      t`${formatUsd(revalidatedShortfall)} more needed in your wallet.`) ||
    (isWalletSelectionHidden &&
      !fallbackChoice &&
      t`Not enough USDC in your wallet. Choose another payment method.`)

  return (
    // A fieldset's anonymous content box prevents its flex children shrinking
    // in Chromium. Keep disabling controls here and let a div own the layout.
    <fieldset className="contents" disabled={isBusy}>
      <div
        className={cn(
          'flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 pt-2 pb-6',
          showNetworkFeeDetails ? undefined : 'px-4',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          <div className="flex w-full min-w-0 flex-col items-center gap-3 px-5 py-3">
            {(premiumLabel || isInPriceCooldown) && (
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                {premiumLabel && (
                  <DomainAttributePill
                    label={t(premiumLabel.label)}
                    variant={premiumLabel.variant}
                  />
                )}
                {isInPriceCooldown && <PriceCooldownPill />}
              </div>
            )}
            <span
              className={cn(
                'wrap-anywhere w-full min-w-0 text-center font-medium font-semi-mono',
                'whitespace-normal leading-ens-none tracking-[-0.8px]',
                'text-ens-gray',
                getDomainSizeClasses(domainName),
              )}
              title={domainName}
            >
              {domainName}
            </span>
          </div>

          <div className="flex w-full flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-ens-quartz-400 text-lg leading-none">
                <Trans>Select payment</Trans>
              </h2>
              <USDCIcon aria-hidden="true" className="size-[18px]" />
            </div>
            {match({
              isConnected,
              isLoading:
                isLoadingBalances ||
                pricingLoading ||
                (isQuotingFunding && !shownFunding) ||
                (paymentMethodItems.length === 0 && isL2Pending),
              isFullyCovered,
              hasNoMethods:
                showNetworkFeeDetails && paymentMethodItems.length === 0,
              stablecoinsCount: stablecoinBalances?.length ?? 0,
            })
              .with({ isConnected: false }, () => (
                <p className="text-ens-quartz-500 text-sm">
                  <Trans>Connect a wallet to see your balances.</Trans>
                </p>
              ))
              .with({ isLoading: true }, () => (
                <div className="flex h-16 items-center justify-center rounded bg-ens-quartz-75 text-ens-quartz-500 text-xs">
                  <Trans>Loading balances…</Trans>
                </div>
              ))
              .with({ isFullyCovered: true }, () => (
                <p className="text-ens-quartz-500 text-sm">
                  {fullyCoveredMessage}
                </p>
              ))
              .with(
                P.union({ hasNoMethods: true }, { stablecoinsCount: 0 }),
                () => (
                  <p className="text-ens-signal-danger-800 text-lg">
                    <Trans>
                      You do not have enough USDC to complete this transaction.
                    </Trans>
                  </p>
                ),
              )
              .otherwise(() => (
                <PaymentMethods
                  onSelectCoin={onSelectCoin}
                  paymentMethodItems={paymentMethodItems}
                  selectedToken={selectedToken}
                  showNetworkFeeDetails={showNetworkFeeDetails}
                  stablecoinBalances={stablecoinBalances}
                  walletShareOf={walletShareOf}
                />
              ))}

            {footer}
          </div>
        </div>

        <PaymentReceipt
          hasExistingBalance={(receiptFigures?.applied ?? 0) > 0}
          isEstimate={isEstimate}
          state={receiptState}
          totalLabel={totalLabel}
        />

        <PaymentAction
          canNext={canNext}
          helpMessage={helpMessage}
          isBusy={isBusy}
          isSettling={isSettling}
          label={nextMessage}
          onNext={onNext}
          onRetry={
            hasBudgetQuoteFailed && !isQuotingFunding ? onRetry : undefined
          }
          warning={warning}
        />
      </div>
    </fieldset>
  )
}
