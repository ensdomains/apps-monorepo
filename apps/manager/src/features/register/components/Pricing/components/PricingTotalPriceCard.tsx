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
    <div className="flex flex-col justify-center gap-4 text-center">
      <div className="space-y-1">
        <p className="font-normal text-[12px] text-lapis-surface tracking-[0.12px]">
          TOTAL
        </p>
        {!isPriceLoading &&
          discountPercentage > 0 &&
          theoreticalTotal > finalPrice && (
            <p className="text-[#7d7d7d] text-[16px] tracking-[-0.28px] line-through">
              ${theoreticalTotal.toFixed(0)} USD
            </p>
          )}
        <div className="flex items-end justify-center gap-[6px]">
          <span className="font-medium font-mono text-[36px] text-primary-midnight-blue leading-none tracking-[0.36px] md:text-[48px] md:tracking-[0.48px]">
            ${isPriceLoading ? '...' : finalPrice.toFixed(0)}
          </span>
          <span className="font-normal text-[16px] text-primary-midnight-blue leading-[27px]">
            USD
          </span>
        </div>
      </div>
      {!isPriceLoading && discountPercentage > 0 && discountAmount > 0 && (
        <div className="mx-auto w-fit rounded bg-[#e7faed] px-4 py-3 md:w-auto">
          <span className="font-normal text-[#007c23] text-[24px] tracking-[-0.22px]">
            Save ${discountAmount.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  )
}
