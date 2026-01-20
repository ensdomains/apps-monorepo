import { match } from 'ts-pattern'
import { useSmartAccountContext } from '@/lib/smart-account'
import { formatTokenBalance } from './utils'

export const TokenSection = () => {
  const { stablecoinBalances, autoFundingMutation } = useSmartAccountContext()

  return (
    <div className="space-y-3">
      <div className="font-medium text-ens-lapis-core text-sm">
        TOKEN BALANCES
      </div>
      <div className="text-[#6B6B6B] text-sm leading-ens-normal">
        💡 For this alpha release, accounts are automatically funded with test
        tokens.
      </div>
      {stablecoinBalances?.map((balance, index) => (
        <div
          className="flex items-center justify-between rounded-lg bg-[#F8F8F8] p-3"
          key={`${balance.address}-${index}`}
        >
          <span className="font-medium text-[#6B6B6B] text-sm">
            {balance.symbol}
          </span>
          {balance.formattedBalance && (
            <span className="font-bold text-[#232222] text-sm">
              {formatTokenBalance(balance.balance, balance.decimals)}{' '}
              {balance.symbol}
            </span>
          )}
        </div>
      ))}

      {match(autoFundingMutation.status)
        .with('pending', () => (
          <div className="flex items-center gap-2 rounded-lg bg-[#F8F8F8] p-3">
            <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
            <span className="text-ens-blue-dark text-sm">
              Requesting test tokens...
            </span>
          </div>
        ))
        .with('error', () => (
          <div className="rounded-lg bg-ens-garnet-dust p-3">
            <div className="font-medium text-ens-garnet-dense text-sm">
              Failed to request test tokens
            </div>
          </div>
        ))
        .otherwise(() => null)}
    </div>
  )
}
