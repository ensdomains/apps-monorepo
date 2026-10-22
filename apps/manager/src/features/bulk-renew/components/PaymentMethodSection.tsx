import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { TokenListItem } from '@/features/register-v2/workflow/pricing/components/TokenListItem'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { RENEWAL_TOKEN } from '@/lib/tokens'

const Message = ({ children }: { readonly children: ReactNode }) => (
  <p className="py-4 text-center font-sans text-ens-quartz-400 text-sm">
    {children}
  </p>
)

/** Stablecoin (USDC / DAI) picker with balances for the confirm step. */
export const PaymentMethodSection = ({
  isConnected,
  isLoadingBalances,
  stablecoinBalances,
  accountCredit,
  selectedToken,
  onSelectCoin,
  priceUSD,
}: {
  readonly isConnected: boolean
  readonly isLoadingBalances: boolean
  readonly stablecoinBalances: readonly StablecoinBalance[]
  /** What the smart account already holds of each coin; it pays first. */
  readonly accountCredit?: Partial<Record<RENEWAL_TOKEN, number>>
  readonly selectedToken: RENEWAL_TOKEN
  readonly onSelectCoin: (coin: RENEWAL_TOKEN) => void
  readonly priceUSD: number
}) => {
  const renderBody = (): ReactNode => {
    if (!isConnected) {
      return (
        <Message>
          <Trans>Please connect your wallet first</Trans>
        </Message>
      )
    }
    if (isLoadingBalances) {
      return (
        <Message>
          <Trans>Loading balances…</Trans>
        </Message>
      )
    }
    if (stablecoinBalances.length === 0) {
      return (
        <Message>
          <Trans>No stablecoins available</Trans>
        </Message>
      )
    }
    return (
      <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
        {stablecoinBalances.map((stablecoin) => (
          <TokenListItem
            key={stablecoin.symbol}
            onSelectCoin={onSelectCoin}
            priceUSD={Math.max(
              0,
              priceUSD -
                (accountCredit?.[stablecoin.symbol as RENEWAL_TOKEN] ?? 0),
            )}
            selectedCoin={selectedToken}
            stablecoin={stablecoin}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium font-sans text-base text-ens-quartz-900">
        <Trans>Select payment</Trans>
      </h3>
      {renderBody()}
    </div>
  )
}
