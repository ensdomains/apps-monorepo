import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { getL2SelectionMessage } from '@/features/register-v2/workflow/pricing/components/L2SourceListItem'
import { PaymentMethodList } from '@/features/register-v2/workflow/pricing/components/PaymentMethodList'
import { TokenListItem } from '@/features/register-v2/workflow/pricing/components/TokenListItem'
import { getL2MethodItems } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import type {
  L2PaymentProps,
  L2PaymentRow,
} from '@/features/register-v2/workflow/pricing/hooks/useL2Payment'
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
  l2Payment,
  selectedL2,
}: {
  readonly isConnected: boolean
  readonly isLoadingBalances: boolean
  readonly stablecoinBalances: readonly StablecoinBalance[]
  /** What the smart account already holds of each coin; it pays first. */
  readonly accountCredit?: Partial<Record<RENEWAL_TOKEN, number>>
  readonly selectedToken: RENEWAL_TOKEN
  readonly onSelectCoin: (coin: RENEWAL_TOKEN) => void
  readonly priceUSD: number
  /** Rows that pay from the wallet's USDC on an L2. */
  readonly l2Payment?: L2PaymentProps
  /** The L2 row chosen to pay, in place of the wallet's coin. */
  readonly selectedL2?: L2PaymentRow
}) => {
  // The L2 rows' fee is what each is charged over the USDC the wallet would pay.
  const usdcCredit = Math.min(accountCredit?.USDC ?? 0, priceUSD)
  const l2Items = getL2MethodItems(
    l2Payment,
    selectedL2,
    {
      registration: priceUSD,
      networkFee: 0,
      total: priceUSD,
      walletDebit: priceUSD - usdcCredit,
      hcaCredit: usdcCredit,
      isLoading: false,
    },
    (chainName) => (
      <Trans>
        An estimate of what the transactions that renew your names cost,
        including moving the USDC from {chainName}. It is paid there with the
        renewal price.
      </Trans>
    ),
  )
  const l2Warning =
    selectedL2 && getL2SelectionMessage(selectedL2, undefined, undefined)

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
    if (stablecoinBalances.length === 0 && l2Items.length === 0) {
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
            selectedCoin={selectedL2 ? undefined : selectedToken}
            stablecoin={stablecoin}
          />
        ))}
        {l2Items.length > 0 && <PaymentMethodList items={l2Items} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium font-sans text-base text-ens-quartz-900">
        <Trans>Select payment</Trans>
      </h3>
      {renderBody()}
      {l2Warning && (
        <p className="text-ens-signal-danger-800 text-sm">{l2Warning}</p>
      )}
    </div>
  )
}
