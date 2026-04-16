import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { cn } from '@/lib/utils'
import type { TokenWithPriceAndBalance } from '../utils/tokenData'

type PaymentTokenListProps = {
  readonly tokenData: readonly TokenWithPriceAndBalance[]
  readonly selectedToken: Address | null
  readonly isRegistering: boolean
  readonly onSelect: (token: TokenWithPriceAndBalance) => void
}

export const PaymentTokenList = ({
  tokenData,
  selectedToken,
  isRegistering,
  onSelect,
}: PaymentTokenListProps) => (
  <div className="space-y-2">
    {tokenData.map((token) => {
      const hasSufficientBalance = token.balance >= token.price.total

      return (
        <button
          key={token.symbol}
          type="button"
          onClick={() => onSelect(token)}
          disabled={!hasSufficientBalance || isRegistering}
          className={cn(
            'flex w-full cursor-pointer items-center justify-between rounded-lg border-border border p-4 text-left transition-colors',
            selectedToken === token.address ? 'bg-muted' : 'hover:bg-muted/30',
            !hasSufficientBalance && 'cursor-not-allowed opacity-60',
          )}
        >
          <div className="flex items-center gap-1">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
              <token.Icon className="size-8 min-w-0 shrink-0" />
            </div>
            <p className="font-medium">{token.symbol}</p>
          </div>
          <div className="text-right">
            <p className="font-normal">
              {Number(
                formatUnits(token.balance, token.decimals),
              ).toLocaleString()}
            </p>
            {hasSufficientBalance ? (
              <p className="text-muted-foreground text-xs">available</p>
            ) : (
              <p className="text-destructive text-xs">Insufficient balance</p>
            )}
          </div>
        </button>
      )
    })}
  </div>
)
