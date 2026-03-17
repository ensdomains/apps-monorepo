import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { useSmartAccountContext } from '@/lib/smart-account'
import { formatTokenBalance } from './utils'

export const TokenSection = () => {
  const { stablecoinBalances, autoFundingMutation } = useSmartAccountContext()

  return (
    <div className="space-y-3">
      <div className="font-medium text-ens-lapis-core text-sm">
        <Trans>TOKEN BALANCES</Trans>
      </div>
      <div className="text-muted-foreground text-sm leading-ens-normal">
        <Trans>
          For this alpha release, accounts are automatically funded with test
          tokens.
        </Trans>
      </div>
      {stablecoinBalances?.map((balance, index) => (
        <div
          className="flex items-center justify-between rounded-lg bg-ens-white p-3"
          key={`${balance.address}-${index}`}
        >
          <span className="font-medium text-muted-foreground text-sm">
            {balance.symbol}
          </span>
          {balance.formattedBalance && (
            <span className="font-bold text-foreground text-sm">
              {formatTokenBalance(balance.balance, balance.decimals)}{' '}
              {balance.symbol}
            </span>
          )}
        </div>
      ))}

      {match(autoFundingMutation.status)
        .with('pending', () => (
          <div className="flex items-center gap-2 rounded-lg bg-ens-white p-3">
            <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
            <span className="text-ens-blue-dark text-sm">
              <Trans>Requesting test tokens...</Trans>
            </span>
          </div>
        ))
        .with('error', () => (
          <div className="rounded-lg bg-ens-garnet-dust p-3">
            <div className="font-medium text-ens-garnet-dense text-sm">
              <Trans>Failed to request test tokens</Trans>
            </div>
          </div>
        ))
        .otherwise(() => null)}
    </div>
  )
}
