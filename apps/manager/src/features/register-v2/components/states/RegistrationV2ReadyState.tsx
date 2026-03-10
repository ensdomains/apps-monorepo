import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import {
  useRegistrationV2Context,
  useRegistrationV2Selector,
} from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2PricingQuoteQueryOptions } from '@/features/register-v2/queries/registrationV2PricingQuoteQueryOptions'
import { startRegistrationV2 } from '@/features/register-v2/transactions/startRegistrationV2'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'

interface RegistrationV2ReadyStateProps {
  targetName: string
}

export const RegistrationV2ReadyState = ({
  targetName,
}: RegistrationV2ReadyStateProps) => {
  const { uiActor } = useRegistrationV2Context()
  const account = useSmartAccountContext()
  const [durationYears, selectedToken] = useRegistrationV2Selector(
    (state) => [state.context.durationYears, state.context.selectedToken],
    (a, b) => a[0] === b[0] && a[1] === b[1],
  )

  const pricingQuery = useQuery(
    getRegistrationV2PricingQuoteQueryOptions({
      routeName: targetName,
      durationYears,
    }),
  )

  const pricingText = pricingQuery.isPending
    ? 'Loading current quote...'
    : pricingQuery.data?.usdc
      ? `Current quote: ${pricingQuery.data.usdc.formatted} USDC for ${durationYears} year${durationYears > 1 ? 's' : ''}.`
      : 'Pricing is available but not rendered in full detail yet.'

  const tokenQuote = pricingQuery.data
    ? selectedToken === SUPPORTED_TOKENS.DAI
      ? pricingQuery.data.dai
      : pricingQuery.data.usdc
    : undefined

  const isAccountReady = Boolean(
    account.signer &&
      account.accountAddress &&
      account.client &&
      account.config,
  )

  const canSubmit = Boolean(
    tokenQuote && isAccountReady && !pricingQuery.isPending,
  )

  const submitLabel = account.isConnected
    ? isAccountReady
      ? pricingQuery.isPending
        ? 'Loading quote...'
        : 'Start registration'
      : 'Preparing wallet...'
    : 'Connect wallet to continue'

  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
        ready
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-muted-foreground text-sm">{pricingText}</p>

      <div className="space-y-2">
        <p className="font-medium text-sm">Duration</p>
        <div className="flex gap-2">
          {[1, 2, 3].map((durationOption) => (
            <button
              className="rounded border px-3 py-2 text-sm"
              key={durationOption}
              onClick={() =>
                uiActor.send({
                  type: 'DURATION_SET',
                  durationYears: durationOption,
                })
              }
              type="button"
            >
              {durationOption} year{durationOption > 1 ? 's' : ''}
              {durationYears === durationOption ? ' (selected)' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-sm">Payment token</p>
        <div className="flex gap-2">
          {Object.entries(SUPPORTED_TOKENS).map(([symbol, tokenAddress]) => (
            <button
              className="rounded border px-3 py-2 text-sm"
              key={symbol}
              onClick={() =>
                uiActor.send({
                  type: 'TOKEN_SET',
                  token: tokenAddress as Address,
                })
              }
              type="button"
            >
              {symbol}
              {selectedToken === tokenAddress ? ' (selected)' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-2 text-sm"
          disabled={!canSubmit}
          onClick={() => {
            if (!tokenQuote) return

            startRegistrationV2(
              {
                name: targetName,
                durationYears,
                selectedToken,
                tokenPrice: tokenQuote.raw,
              },
              account,
              uiActor,
              {
                publicClient,
                fast: true,
              },
            )
          }}
          type="button"
        >
          {submitLabel}
        </button>
      </div>

      <p className="text-muted-foreground text-sm">
        Selected payment token:{' '}
        {selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'}
      </p>
    </section>
  )
}
