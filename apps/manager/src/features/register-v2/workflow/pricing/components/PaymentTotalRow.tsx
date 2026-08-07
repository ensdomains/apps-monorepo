import { Trans } from '@lingui/react/macro'
import { formatPricingUsd } from './AnimatedPrice'

/**
 * The headline figure at the foot of the payment screen — what actually leaves
 * the wallet, per design (node 3867:126050).
 *
 * With a funding budget quoted that is `rent + networkFee`, and the fee half is
 * an estimate, so the figure is an upper bound: hence "up to". Without a budget
 * the total is exact rent and the hedge would be a lie, so it is dropped.
 */
export const PaymentTotalRow = ({
  total,
  isEstimate,
}: {
  total: number | undefined
  isEstimate: boolean
}) => (
  <div className="flex w-full items-baseline justify-between">
    <span className="text-ens-quartz-350 text-lg leading-ens-none tracking-[-0.36px]">
      <Trans>Total</Trans>
    </span>
    <div className="flex items-center gap-2">
      <p className="tracking-[0.36px]">
        {isEstimate && (
          <span className="text-base text-ens-quartz-350">
            <Trans>up to</Trans>{' '}
          </span>
        )}
        <span className="text-[20px] text-ens-quartz-900 tabular-nums">
          {formatPricingUsd(total ?? 0)}
        </span>
      </p>
      <span className="text-ens-quartz-350 text-lg leading-ens-none tracking-[-0.36px]">
        USD
      </span>
    </div>
  </div>
)
