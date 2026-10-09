import { TaggedError } from '@ens-apps/utils/neverthrow'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { type ReactNode, useState } from 'react'
import { match, P } from 'ts-pattern'
import { isAddressEqual } from 'viem'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import { type SUPPORTED_TOKEN, TOKENS } from '@/lib/tokens'
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
import { useAutoSelectOnlyToken } from '../hooks/useAutoSelectOnlyToken'
import { getPaymentBreakdownFigures } from '../lib/paymentBreakdownFigures'
import { getPremiumLabel } from '../lib/premiumLabel'
import {
  computeRegistrationFunding,
  getRegistrationShortfallCause,
  type RegistrationShortfallCause,
} from '../lib/registrationFunding'
import { PaymentBreakdown } from './PaymentBreakdown'
import {
  PaymentMethodList,
  type PaymentMethodListItem,
} from './PaymentMethodList'
import { PaymentTotalRow } from './PaymentTotalRow'
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
    readonly shortfallCause: Exclude<RegistrationShortfallCause, null>,
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

const PaymentMethods = ({
  showNetworkFeeDetails,
  paymentMethodItems,
  stablecoinBalances,
  onSelectCoin,
  selectedToken,
  requiredAmount,
}: {
  readonly showNetworkFeeDetails: boolean
  readonly paymentMethodItems: readonly PaymentMethodListItem[]
  readonly stablecoinBalances: readonly StablecoinBalance[]
  readonly onSelectCoin: (coin: SUPPORTED_TOKEN) => void
  readonly selectedToken: SUPPORTED_TOKEN | undefined
  readonly requiredAmount: number | undefined
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
          priceUSD={requiredAmount ?? 0}
          selectedCoin={selectedToken}
          stablecoin={stablecoin}
        />
      ))}
    </div>
  )
}

const getPaymentHeadline = (
  funding: RegistrationFundingSummary | undefined,
  displayTotal: number | undefined,
) => {
  if (!funding) {
    return {
      hasAccountCredit: false,
      headlineAmount: displayTotal,
      networkFee: undefined,
    }
  }

  const figures = getPaymentBreakdownFigures(funding)
  return {
    hasAccountCredit: figures.credit > 0,
    headlineAmount: figures.walletDebit,
    networkFee: figures.networkFee,
  }
}

export const TokenPickerContent = () => {
  const { t } = useLingui()
  const { label, uiActor } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const domainName = `${label}.eth`
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
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
  const [setPrimaryChoice, setSetPrimaryChoice] = useState<boolean | null>(null)
  const setAsPrimary = setPrimaryChoice ?? defaultSetAsPrimary

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
    walletBalanceRaw: usdcBalanceRaw,
    ...(budgetQuery.data ? { hcaBalanceRaw: budgetQuery.data.hcaBalance } : {}),
    decimals: USDC_DECIMALS,
  })

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

  // Dispatch `registration.start`. The smart-session gate runs UP FRONT (in
  // PaymentCard, before this chooser opens), so on the HCA path a session is
  // already active here and `account.signer` carries it — no signer override
  // or enable prompt is needed at this step.
  const startRegistration = async (resolvedSetAsPrimary: boolean) => {
    if (!pricingQuery.data || !selectedToken) return
    // Resolve the session-enable payload up front; both legs are signed with it.
    const hcaSessionEnable = await account.getSessionEnablePayload()
    uiActor.send({
      type: 'registration.start',
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
    })
  }

  const availabilityMutation = useMutation({
    mutationFn: async () => {
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
      const shortfallCause = budget
        ? getRegistrationShortfallCause({
            totalRaw: budget.total,
            registrationPriceRaw: budget.registrationPrice,
            hcaBalanceRaw: budget.hcaBalance,
            walletBalanceRaw: usdcBalanceRaw,
          })
        : null

      if (
        walletDebitRaw !== null &&
        usdcBalanceRaw !== null &&
        shortfallCause !== null
      ) {
        throw new InsufficientFundingError(
          decimalBigintToNumber(walletDebitRaw, USDC_DECIMALS),
          decimalBigintToNumber(usdcBalanceRaw, USDC_DECIMALS),
          shortfallCause,
        )
      }

      const [availability, resolvedSetAsPrimary] = await Promise.all([
        queryClient.fetchQuery({
          ...getRegistrationV2AvailabilityQueryOptions(`${label}.eth`),
          staleTime: 0,
        }),
        resolveSetAsPrimary(),
      ])
      return { availability, resolvedSetAsPrimary }
    },
    onSuccess: async ({ availability, resolvedSetAsPrimary }) => {
      if (!pricingQuery.data || !selectedToken) return

      if (!availability.isAvailable) {
        navigate({
          replace: true,
          to: '/$name',
          params: { name: `${label}.eth` },
        })
        return
      }

      await startRegistration(resolvedSetAsPrimary)
    },
  })

  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()

  const revalidatedFundingError =
    availabilityMutation.error instanceof InsufficientFundingError
      ? availabilityMutation.error
      : null

  // Funding errors belong to the affected method. Prefer the rendered quote:
  // it is the amount the user is looking at, while a click-path revalidation
  // can only supply a fallback when no rendered shortfall is available.
  const methodErrorMessage = match({
    renderFunding: funding,
    revalidatedFundingError,
  })
    .with(
      { renderFunding: { shortfallCause: 'name-price' } },
      ({ renderFunding }) => {
        const amount = formatUsd(renderFunding.walletDebit)
        return t`${amount} needed to register name`
      },
    )
    .with(
      { renderFunding: { shortfallCause: 'network-fee' } },
      () => t`not enough funds to pay network fees`,
    )
    .with(
      { revalidatedFundingError: { shortfallCause: 'name-price' } },
      ({ revalidatedFundingError }) => {
        const amount = formatUsd(revalidatedFundingError.required)
        return t`${amount} needed to register name`
      },
    )
    .with(
      { revalidatedFundingError: { shortfallCause: 'network-fee' } },
      () => t`not enough funds to pay network fees`,
    )
    .otherwise(() => null)

  const globalErrorMessage = match({
    hasBudgetQuoteFailed,
    mutationError: availabilityMutation.error,
    isAvailabilityError: availabilityMutation.isError,
  })
    .with(
      P.union(
        { hasBudgetQuoteFailed: true },
        { mutationError: P.instanceOf(BudgetQuoteUnavailableError) },
      ),
      () =>
        t`We couldn't work out the full cost of this registration right now, so we can't start it safely. Please try again in a moment.`,
    )
    .with(
      { isAvailabilityError: true },
      () =>
        t`We couldn't confirm that ${domainName} is still available. Please try again.`,
    )
    .otherwise(() => null)

  // Positive counterpart to the underfunded copy, for the one thing no amount
  // in the breakdown can show. Full coverage takes the no-permit branch in
  // `computingHcaBudget`, so the approval step they saw last time simply will
  // not appear; saying so up front is the difference between "it skipped a
  // step" and "something went wrong". A partial credit is only an amount, and
  // belongs in the breakdown rather than in a sentence repeating it.
  const infoMessage = match(funding)
    .with(
      { isUnderfunded: false, hcaCredit: P.number.gt(0), walletDebit: 0 },
      (f) =>
        t`What was left from your last attempt covers the ${f.total.toFixed(2)} USDC this registration needs, so you won't be asked to approve a payment.`,
    )
    .otherwise(() => null)

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
      infoMessage={infoMessage}
      isConnected={isConnected}
      isInPriceCooldown={(pricingQuery.data?.premiumPriceNumber ?? 0) > 0}
      isLoadingBalances={isLoadingBalances}
      isQuoteStale={budgetQuery.isPlaceholderData}
      isQuotingFunding={budgetQuery.isLoading}
      label={label}
      methodErrorMessage={methodErrorMessage}
      onNext={() => availabilityMutation.mutate()}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.totalPriceNumber}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      showNetworkFeeDetails
      stablecoinBalances={stablecoinBalances}
    />
  )
}

/**
 * The single message slot under the token list. The error wins when there is
 * one — a "you are already funded" note printed beneath a funding failure is a
 * contradiction, and the error is the half the user can act on.
 */
const PickerMessage = ({
  errorMessage,
  infoMessage,
}: {
  errorMessage?: string | null
  infoMessage?: string | null
}) => {
  if (errorMessage) {
    return <p className="text-center text-ens-error text-sm">{errorMessage}</p>
  }
  if (infoMessage) {
    return (
      <p className="text-center text-ens-blue-dark text-sm">{infoMessage}</p>
    )
  }
  return null
}

export const TokenPickerContentBase = ({
  label,
  pricingLoading,
  pricingData,
  isInPriceCooldown = false,
  selectedToken,
  globalErrorMessage,
  methodErrorMessage,
  infoMessage,
  onSelectCoin,
  onNext,
  stablecoinBalances,
  isLoadingBalances,
  isConnected,
  nextMessage = <Trans>Register name</Trans>,
  footer,
  funding,
  isQuotingFunding = false,
  showNetworkFeeDetails = false,
  isFeeTooltipOpen,
  isQuoteStale = false,
  hasBudgetQuoteFailed = false,
}: {
  readonly label: string
  readonly pricingLoading: boolean
  readonly pricingData: number | undefined
  readonly isInPriceCooldown?: boolean
  readonly selectedToken: SUPPORTED_TOKEN | undefined
  readonly globalErrorMessage?: string | null
  readonly methodErrorMessage?: string | null
  /** Reassurance shown only when there is no global error. */
  readonly infoMessage?: string | null
  readonly onSelectCoin: (coin: SUPPORTED_TOKEN) => void
  readonly onNext: () => void
  readonly stablecoinBalances: StablecoinBalance[]
  readonly isLoadingBalances: boolean
  readonly isConnected: boolean
  readonly nextMessage?: ReactNode
  /** Optional content below the payment options (e.g. the primary-name toggle). */
  readonly footer?: ReactNode
  /**
   * Carries the funding budget used by the method-level fee disclosure and the
   * inherited account-credit breakdown. When present, `walletDebit` — not
   * `pricingData` — is what the wallet must cover.
   */
  readonly funding?: RegistrationFundingSummary
  /** The method-level fee quote is still in flight. */
  readonly isQuotingFunding?: boolean
  /** Registration-only disclosure; renewals keep their existing token row. */
  readonly showNetworkFeeDetails?: boolean
  /** Story-only control used to capture the open tooltip reference state. */
  readonly isFeeTooltipOpen?: boolean
  /** A placeholder quote belongs to the previous primary-name choice. */
  readonly isQuoteStale?: boolean
  /** A required budget quote failed, so checkout must remain blocked. */
  readonly hasBudgetQuoteFailed?: boolean
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
  // the remainder itself — gating on the budget would block a wallet that only
  // owes the shortfall.
  const requiredAmount = funding?.walletDebit ?? pricingData

  // What the registration costs before any standing credit is applied.
  const displayTotal = funding?.total ?? pricingData

  // With USDC already in the HCA the headline is the wallet debit. The credit
  // line and the method-level fee use the same rounded figures, so the amounts
  // shown on screen remain checkable.
  const {
    hasAccountCredit,
    headlineAmount,
    networkFee: displayedNetworkFee,
  } = getPaymentHeadline(funding, displayTotal)

  const selectedCoinBalance = stablecoinBalances?.find(
    (coin) => coin.symbol === selectedToken,
  )

  // Tested for presence, never truthiness: a debit of 0 is a legitimate state,
  // not a missing quote. An HCA already holding the whole budget — an aborted
  // registration that funded the commit but never revealed — owes the wallet
  // nothing, and a falsy 0 would block exactly the retry that should sail
  // through.
  const hasSufficientBalanceForSelectedCoin =
    selectedCoinBalance !== undefined &&
    requiredAmount !== undefined &&
    decimalBigintToNumber(
      BigInt(selectedCoinBalance.balance),
      selectedCoinBalance.decimals,
    ) >= requiredAmount

  const canNext =
    isConnected &&
    !!selectedToken &&
    !pricingLoading &&
    !isQuoteStale &&
    hasBalances &&
    hasSufficientBalanceForSelectedCoin &&
    // Refuse rather than proceed on a figure that cannot fund the batch.
    !hasBudgetQuoteFailed

  const paymentMethodItems: PaymentMethodListItem[] = stablecoinBalances.map(
    (stablecoin) => {
      const balance = decimalBigintToNumber(
        BigInt(stablecoin.balance),
        stablecoin.decimals,
      )
      const isFunded = requiredAmount !== undefined && balance >= requiredAmount

      return {
        id: stablecoin.address,
        isAvailable: true,
        isFunded,
        isCommon: stablecoin.symbol === TOKENS.USDC.symbol,
        content: (
          <TokenListItem
            errorMessage={
              stablecoin.symbol === TOKENS.USDC.symbol
                ? methodErrorMessage
                : undefined
            }
            isFeeTooltipOpen={isFeeTooltipOpen}
            isNetworkFeeLoading={isQuotingFunding || funding?.isLoading}
            networkFee={displayedNetworkFee}
            onSelectCoin={onSelectCoin}
            priceUSD={requiredAmount ?? 0}
            selectedCoin={selectedToken}
            showNetworkFeeDetails={showNetworkFeeDetails}
            stablecoin={stablecoin}
          />
        ),
      }
    },
  )

  return (
    // `min-h-0` lets the registration sheet scroll within its viewport rather
    // than clipping the total and action button on short screens.
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col gap-6 pt-2 pb-6',
        showNetworkFeeDetails ? undefined : 'px-4',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-8 overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-2xl bg-ens-quartz-50 p-6">
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

          <PaymentBreakdown funding={funding} />
        </div>

        <div className="flex w-full flex-col gap-4">
          <h2 className="text-center font-medium text-[18px] leading-ens-none">
            <Trans>Select payment</Trans>
          </h2>
          {match({
            isLoadingBalances,
            hasBalances,
            stablecoinsCount: stablecoinBalances?.length ?? 0,
            isConnected,
            pricingLoading,
          })
            .with({ isConnected: false }, () => (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-ens-gray text-sm">
                  <Trans>Please connect your wallet first</Trans>
                </div>
                <div className="text-ens-gray-three text-xs">
                  <Trans>
                    You need to connect a wallet to see your stablecoin balances
                  </Trans>
                </div>
              </div>
            ))
            .with({ isLoadingBalances: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>Loading your stablecoin balances...</Trans>
                </div>
              </div>
            ))
            .with({ pricingLoading: true }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>Loading pricing...</Trans>
                </div>
              </div>
            ))
            .with({ stablecoinsCount: 0 }, () => (
              <div className="flex items-center justify-center py-8">
                <div className="text-ens-gray-two text-sm">
                  <Trans>No stablecoins available</Trans>
                </div>
              </div>
            ))
            .with({ stablecoinsCount: P.number.gt(0) }, () => (
              <PaymentMethods
                onSelectCoin={onSelectCoin}
                paymentMethodItems={paymentMethodItems}
                requiredAmount={requiredAmount}
                selectedToken={selectedToken}
                showNetworkFeeDetails={showNetworkFeeDetails}
                stablecoinBalances={stablecoinBalances}
              />
            ))
            .otherwise(() => undefined)}

          <PickerMessage
            errorMessage={globalErrorMessage}
            infoMessage={infoMessage}
          />

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
              <Trans>Stables accepted</Trans>
            </p>
            <div className="flex items-center gap-1">
              <USDCIcon className="h-7 w-7" />
            </div>
          </div>

          {footer}
        </div>
      </div>

      <PaymentTotalRow
        hasAccountCredit={hasAccountCredit}
        isEstimate={!!funding || hasBudgetQuoteFailed}
        total={headlineAmount}
      />

      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          'hover:bg-ens-gray-two',
          'disabled:cursor-not-allowed disabled:opacity-50',
          canNext && 'bg-ens-blue text-white hover:bg-ens-blue-hover',
        )}
        disabled={!canNext}
        onClick={onNext}
      >
        {nextMessage}
      </Button>
    </div>
  )
}
