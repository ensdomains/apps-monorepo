import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { isAddressEqual } from 'viem'
import { sepolia } from 'viem/chains'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { DomainAttributePill } from '@/components/molecules/DomainResultCard/DomainAttributePill'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { STABLECOINS } from '@/features/register/utils'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { getRegistrationV2AvailabilityQueryOptions } from '../../../data/queries/availability.query'
import { getHcaBudgetQueryOptions } from '../../../data/queries/hcaBudget.query'
import { getRegisterPriceQueryOptions } from '../../../data/queries/pricing.query'
import { getManagerRegistrationPostRegistrationSetup } from '../../../state/registrationAutoSetup'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { truncateName } from '../../../utils/truncate-name'
import { getPremiumLabel } from '../lib/premiumLabel'
import { computeRegistrationFunding } from '../lib/registrationFunding'
import {
  PaymentCardBaseLine,
  PaymentCardNetworkFeeLine,
} from './PaymentCardLineItems'

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

export const ConfirmPurchase = () => {
  const { t } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { label, uiActor } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(label, duration, selectedToken),
    select: (data) => ({
      basePriceNumber: decimalBigintToNumber(
        data.basePrice,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      premiumPriceNumber: decimalBigintToNumber(
        data.premium,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      totalPriceNumber: decimalBigintToNumber(
        data.basePrice + data.premium,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      rawPrice: data.basePrice + data.premium,
    }),
  })

  const domainName = `${label}.eth`

  // The wallet's Circle-USDC balance. This is the EOA owner's balance (see
  // `useSmartAccountBalances`), which is the account the funding permit debits.
  const usdcBalanceRaw = (() => {
    const usdc = getDestinationContracts(sepolia.id).usdc
    const entry = account.stablecoinBalances.find((balance) =>
      isAddressEqual(balance.address, usdc),
    )
    return entry ? BigInt(entry.balance) : null
  })()

  const budgetQueryOptions = getHcaBudgetQueryOptions({
    label,
    durationInSeconds: duration,
    hca: account.accountAddress,
    signer: account.signer,
    getSessionEnablePayload: account.getSessionEnablePayload,
  })
  const budgetQuery = useQuery(budgetQueryOptions)

  // What the wallet is actually debited, itemised. Absent until the quote
  // lands, and permanently absent if it fails — in which case the screen falls
  // back to showing the price alone rather than blocking on a flaky quote.
  const funding = computeRegistrationFunding({
    budget: budgetQuery.data,
    walletBalanceRaw: usdcBalanceRaw,
    decimals: USDC_DECIMALS,
  })

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      // Re-check funding on the click path, not just on render: the quote may
      // still have been in flight when the screen painted, and a stale budget
      // would let through exactly the registration this gate exists to stop.
      // `fetchQuery` reuses the in-flight/fresh result, so this is usually free.
      const budget = await queryClient
        .fetchQuery(budgetQueryOptions)
        // A quote failure is not a funding failure. Fall through and let the
        // machine (and its own pre-permit balance check) surface the problem.
        .catch(() => null)

      if (budget && usdcBalanceRaw !== null && usdcBalanceRaw < budget.total) {
        throw new InsufficientFundingError(
          decimalBigintToNumber(budget.total, USDC_DECIMALS),
          decimalBigintToNumber(usdcBalanceRaw, USDC_DECIMALS),
        )
      }

      const [availability, existingPrimaryName, ownedNamesCount] =
        await Promise.all([
          queryClient.fetchQuery({
            ...getRegistrationV2AvailabilityQueryOptions(`${label}.eth`),
            staleTime: 0,
          }),
          queryClient.fetchQuery(
            profileReverseNameQuery(account.ownerAddress ?? undefined),
          ),
          queryClient.fetchQuery(
            ownedNamesCountQueryOptions(account.ownerAddress ?? undefined),
          ),
        ])

      return { availability, existingPrimaryName, ownedNamesCount }
    },
    onSuccess: async ({
      availability,
      existingPrimaryName,
      ownedNamesCount,
    }) => {
      if (!pricingQuery.data || !selectedToken) {
        return
      }

      if (!availability.isAvailable) {
        navigate({
          replace: true,
          to: '/$name',
          params: { name: `${label}.eth` },
        })
        return
      }

      // Resolve the session-enable payload up front (checks on-chain
      // enablement so an already-enabled session skips the enable call).
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
        postRegistrationSetup: getManagerRegistrationPostRegistrationSetup({
          ownerAddress: account.ownerAddress,
          existingPrimaryName,
          ownedNamesCount,
        }),
      })
    },
  })

  // Prefer the funding shortfall over the generic availability copy: it is the
  // more specific failure and the only one the user can act on directly.
  const mutationError = availabilityMutation.error
  const errorMessage = funding?.isUnderfunded
    ? t`Not enough USDC. This registration needs ${funding.total.toFixed(2)} USDC — a ${funding.registration.toFixed(2)} registration plus a ${funding.networkFee.toFixed(2)} network fee — but your wallet holds ${(funding.walletBalance ?? 0).toFixed(2)} USDC.`
    : mutationError instanceof InsufficientFundingError
      ? t`Not enough USDC. This registration needs ${mutationError.required.toFixed(2)} USDC but your wallet holds ${mutationError.available.toFixed(2)} USDC.`
      : availabilityMutation.isError
        ? t`We couldn't confirm that ${domainName} is still available. Please try again.`
        : null

  return (
    <ConfirmPurchaseBase
      canNext={
        !!pricingQuery.data &&
        selectedToken !== undefined &&
        !pricingQuery.isLoading &&
        !funding?.isUnderfunded
      }
      costBreakdown={
        funding
          ? {
              registration: funding.registration,
              networkFee: funding.networkFee,
              isLoading: budgetQuery.isFetching,
            }
          : undefined
      }
      errorMessage={errorMessage}
      label={label}
      nextMessage={<Trans>Register name</Trans>}
      onNext={() => availabilityMutation.mutate()}
      // With a breakdown present this MUST be the funded total, not the rent —
      // it is what leaves the wallet.
      pricingData={funding?.total ?? pricingQuery.data?.totalPriceNumber}
      selectedToken={selectedToken}
      supportingMessage={
        <Trans>
          If your connected wallet has fewer than two names and no primary name
          yet, ENS may set this name as your primary name and link it to your
          connected wallet automatically.
        </Trans>
      }
      title={<Trans>Registering</Trans>}
    />
  )
}

export const ConfirmPurchaseBase = ({
  label,
  pricingData,
  onNext,
  selectedToken,
  errorMessage,
  nextMessage,
  canNext,
  title,
  supportingMessage,
  costBreakdown,
}: {
  label: string
  pricingData: number | undefined
  onNext: () => void
  selectedToken: SUPPORTED_TOKEN | undefined
  errorMessage?: string | null
  nextMessage: ReactNode
  canNext: boolean
  title: ReactNode
  supportingMessage?: ReactNode
  /**
   * Itemises `pricingData` when the headline figure is more than the rent —
   * the standalone-HCA route funds both on-chain legs from the same wallet
   * transfer, so the amount debited is `registration + networkFee`. Omitted by
   * the renew flow, which pays the registrar directly from the EOA and has no
   * pre-funded budget to explain. When present, `pricingData` MUST be the sum.
   */
  costBreakdown?: {
    registration: number
    networkFee: number
    isLoading: boolean
  }
}) => {
  const { t } = useLingui()

  const premiumLabel = getPremiumLabel(label.length)
  const domainName = `${label}.eth`

  const selectedCoinConfig = selectedToken && STABLECOINS[selectedToken]
  const SelectedCoinIcon = selectedCoinConfig?.icon || USDCIcon

  return (
    <div className="flex h-full flex-1 flex-col justify-between gap-4 px-4">
      <div className="flex flex-col items-center gap-6">
        <h2 className="text-center font-medium text-2xl text-ens-lapis-dense tracking-wide">
          {title}
        </h2>

        <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-xl bg-[rgb(250,250,250)] px-6 py-8">
          {premiumLabel && (
            <DomainAttributePill
              label={t(premiumLabel.label)}
              variant={premiumLabel.variant}
            />
          )}
          <span
            className={cn(
              'w-full min-w-0 text-center font-medium font-semi-mono',
              'text-[40px] leading-ens-none tracking-[-0.8px]',
              'text-ens-gray',
            )}
            title={domainName}
          >
            {truncateName(label, 'eth', 10)}
          </span>
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-base text-ens-gray">
              <Trans>for</Trans>
            </span>
            <div className="flex items-baseline gap-1">
              <SelectedCoinIcon className="h-6 w-6 self-center" />
              <span className="font-medium text-2xl text-ens-gray tracking-tight">
                {formatUsd(pricingData ?? 0)}
              </span>
              <span className="text-ens-gray-three text-lg">
                {selectedToken || 'USDC'}
              </span>
            </div>
          </div>

          {costBreakdown && (
            <div className="w-full max-w-55 space-y-2 border-ens-quartz-75 border-t pt-3">
              <PaymentCardBaseLine
                basePrice={costBreakdown.registration}
                isLoading={costBreakdown.isLoading}
              />
              <PaymentCardNetworkFeeLine
                isLoading={costBreakdown.isLoading}
                networkFee={costBreakdown.networkFee}
              />
            </div>
          )}
        </div>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {supportingMessage ? (
          <p className="text-center text-ens-gray-three text-sm">
            {supportingMessage}
          </p>
        ) : null}
      </div>

      <Button
        className="h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover"
        disabled={!pricingData || !selectedToken || !canNext}
        onClick={() => {
          if (!pricingData || !selectedToken || !canNext) {
            return
          }

          onNext()
        }}
      >
        {nextMessage}
      </Button>
    </div>
  )
}
