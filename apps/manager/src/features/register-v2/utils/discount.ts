import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const calculateDiscount = (
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
    basePriceWithoutDiscount,
    discountAmount,
    discountPercentage,
  }
}
