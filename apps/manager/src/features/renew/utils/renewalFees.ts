import { HcaIntentFeeExceedsMaximumError } from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'

/** The rail could not price one of a renewal's intents. */
export class RenewalFeeUnpricedError extends TaggedError(
  'RenewalFeeUnpricedError',
) {}

/** The intents' quoted fees summed, or `null` when any one could not be priced. */
export const sumRenewalFees = (
  fees: readonly (bigint | null)[],
): bigint | null =>
  fees.reduce<bigint | null>(
    (sum, fee) => (sum === null || fee === null ? null : sum + fee),
    0n,
  )

/**
 * The fee an L2 payment is sized on: every intent priced, and each within the
 * ceiling for its declared gas. The amount grows with the fee, so the ceilings
 * bound the payment too.
 */
export const checkRenewalFees = (
  quotes: readonly { readonly fee: bigint | null; readonly maxFee: bigint }[],
): Result<
  bigint,
  RenewalFeeUnpricedError | HcaIntentFeeExceedsMaximumError
> => {
  const total = sumRenewalFees(quotes.map(({ fee }) => fee))
  if (total === null) {
    return err(
      new RenewalFeeUnpricedError({
        message: 'A renewal intent could not be priced.',
      }),
    )
  }
  const overCap = quotes.find(({ fee, maxFee }) => fee !== null && fee > maxFee)
  return overCap?.fee == null
    ? ok(total)
    : err(new HcaIntentFeeExceedsMaximumError(overCap.fee, overCap.maxFee))
}
