import { Trans } from '@lingui/react/macro'

type PricingTotalPriceCardProps = {
  isPriceLoading: boolean
  finalPrice: number
  discountPercentage: number
  discountAmount: number
  theoreticalTotal: number
}

export const PricingTotalPriceCard = ({
  isPriceLoading,
  finalPrice,
  discountPercentage,
  discountAmount,
  theoreticalTotal,
}: PricingTotalPriceCardProps) => {
  return (
    <div className="pricing-total-price-card flex flex-col justify-center gap-4 text-center">
      <div className="space-y-1">
        <p className="font-normal text-ens-lapis-surface text-xs tracking-wide">
          <Trans>TOTAL</Trans>
        </p>
        <div className="min-h-6">
          {!isPriceLoading &&
            discountPercentage > 0 &&
            theoreticalTotal > finalPrice && (
              <p className="text-base text-ens-gray tracking-tight line-through">
                $
                {theoreticalTotal.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}{' '}
                USD
              </p>
            )}
        </div>
        <div className="flex items-end justify-center gap-1.5">
          <span className="font-medium font-mono text-4xl text-ens-blue-midnight leading-none tracking-wide md:text-5xl md:tracking-wider">
            $
            {isPriceLoading
              ? '...'
              : finalPrice.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}
          </span>
          <span className="font-normal text-base text-ens-blue-midnight leading-7">
            USD
          </span>
        </div>
      </div>
      <div className="min-h-12">
        {!isPriceLoading && discountPercentage > 0 && discountAmount > 0 && (
          <div className="mx-auto w-fit rounded bg-ens-peridot-dust px-4 py-3 md:w-auto">
            <span className="font-normal text-2xl text-ens-peridot-core tracking-tight">
              <Trans>
                Save $
                {discountAmount.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}
              </Trans>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
