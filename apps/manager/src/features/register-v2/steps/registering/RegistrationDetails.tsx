import { format } from 'date-fns'
import { secondsInYear } from 'date-fns/constants'
import { useMemo } from 'react'
import { DomainCard } from '@/components/atoms/DomainCard/DomainCard'
import { LinkButton } from '@/components/ui/button'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { RegisterV2Context } from '../../machines/RegistrationV2UiContext'
import { useBaseRate } from '../../queries/baseRates'

const useDetails = RegisterV2Context.createSelector(
  (state) => state.context.confirmedData,
)

const useIsCompleted = RegisterV2Context.createSelector((state) =>
  state.matches('success'),
)

const getDiscount = (
  basePriceNumber: number,
  baseRate: bigint,
  duration: bigint,
) => {
  const basePriceWithoutDiscount = decimalBigintToNumber(
    duration * baseRate,
    12,
  )
  const discountAmount = Math.max(basePriceWithoutDiscount - basePriceNumber, 0)
  const discountPercentage = Math.round(
    (discountAmount / basePriceWithoutDiscount) * 100,
  )

  return {
    discountAmount,
    discountPercentage,
  }
}

export const RegistrationDetails = () => {
  const { uiActor, label } = RegisterV2Context.use()
  const details = useDetails(uiActor)
  const isCompleted = useIsCompleted(uiActor)
  const baseRate = useBaseRate(label)

  const expirationDate = useMemo(
    () =>
      format(
        new Date(Date.now() + Number(details?.duration ?? 0) * 1000),
        'MMMM d, yyyy',
      ),
    [details?.duration],
  )

  if (!details) return null

  const { discountAmount, discountPercentage } = getDiscount(
    details.basePriceNumber,
    baseRate,
    details.duration,
  )

  const durationYears = Math.round(Number(details?.duration) / secondsInYear)
  const totalPrice =
    details.basePriceNumber + details.premiumPriceNumber - discountAmount

  return (
    <div className={'flex w-full flex-col gap-6'}>
      {/* Main Content - Two columns on desktop, stacked on mobile */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-16">
        {/* Domain Card */}
        <div className="w-full lg:w-1/2">
          <DomainCard domainName={`${details.label}.eth`} variant="garnet" />
        </div>

        {/* Registration Details */}
        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-5">
            <h3 className="font-medium text-ens-blue-dark text-xl tracking-tight">
              Registration Details
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">Registration Period</p>
                <p className="text-base text-ens-blue-dark">
                  {durationYears} years
                </p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">Registration Fee</p>
                <p className="text-base text-ens-blue-dark">
                  {formatUsd(details.basePriceNumber)}
                </p>
              </div>

              {details.premiumPriceNumber > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-base text-ens-gray">Premium Fee</p>
                  <p className="text-base text-ens-blue-dark">
                    {formatUsd(details.premiumPriceNumber)}
                  </p>
                </div>
              )}

              {discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-base text-ens-peridot-core">
                    Multi-year Discount ({discountPercentage}%)
                  </p>
                  <p className="text-base text-ens-peridot-core">
                    -{formatUsd(discountAmount)}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between border-ens-gray-two border-t pt-4">
                <p className="text-base text-ens-blue-dark">Total Paid</p>
                <p className="text-base text-ens-blue-dark">
                  {formatUsd(totalPrice)}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-base text-ens-gray">Expires</p>
                <p className="text-base text-ens-blue">
                  {format(expirationDate, 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          {isCompleted && (
            <LinkButton
              params={{ name: `${details.label}.eth` }}
              size="xl"
              to="/p/$name"
              variant="blue"
            >
              Create Profile
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}
