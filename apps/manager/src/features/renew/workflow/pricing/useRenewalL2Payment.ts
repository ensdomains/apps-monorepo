import type { FundingSourceOrigin } from '@/features/register-v2/state/registrationUi.machine'
import {
  type L2PaymentProps,
  useL2PaymentRows,
} from '@/features/register-v2/workflow/pricing/hooks/useL2Payment'
import { getL2RenewalAmountOut } from '@/features/renew/utils/l2RenewalAmount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

/** A renewal's L2 rows: each bridges what the account is short in USDC in from that L2. */
export const useRenewalL2Payment = ({
  rentTotalRaw,
  feeRaw,
  hcaBalanceRaw,
  isEnabled,
  selectedChainId,
  selectedOrigin,
  onSelect,
  onFallbackSelect = onSelect,
}: {
  /** The USDC price with its approval headroom, once priced. */
  readonly rentTotalRaw: bigint | undefined
  /** The intents' quoted fee in USDC. */
  readonly feeRaw: bigint | undefined
  /** The account's USDC, or `undefined` when unread; the payment re-reads it anyway. */
  readonly hcaBalanceRaw: bigint | undefined
  /** Intent route only: the wallet route pays the renewer directly. */
  readonly isEnabled: boolean
  readonly selectedChainId: number | undefined
  readonly selectedOrigin?: FundingSourceOrigin
  readonly onSelect: (chainId: number) => void
  readonly onFallbackSelect?: (chainId: number) => void
}): L2PaymentProps | undefined => {
  const { signer, ownerAddress, accountAddress } = useSmartAccountContext()
  const amountRaw =
    rentTotalRaw === undefined || feeRaw === undefined
      ? null
      : getL2RenewalAmountOut({
          rentTotal: rentTotalRaw,
          quotedFeeUsdc: feeRaw,
          hcaBalance: hcaBalanceRaw ?? 0n,
        })

  return useL2PaymentRows({
    owner: ownerAddress ?? null,
    hca:
      signer?.type === 'rhinestone' && accountAddress
        ? { address: accountAddress, config: signer.account.config }
        : undefined,
    amountRaw,
    statusAmountRaw: amountRaw,
    isEnabled,
    selectedChainId,
    selectedOrigin,
    onSelect,
    onFallbackSelect,
  })
}
