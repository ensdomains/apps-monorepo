import type { Address } from 'viem'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'

interface RegistrationV2ReadyStateProps {
  targetName: string
  durationYears: number
  selectedToken: Address
  pricingText: string
  onSetDuration: (durationYears: number) => void
  onSetToken: (token: Address) => void
}

export const RegistrationV2ReadyState = ({
  targetName,
  durationYears,
  selectedToken,
  pricingText,
  onSetDuration,
  onSetToken,
}: RegistrationV2ReadyStateProps) => {
  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        ready
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-sm text-muted-foreground">{pricingText}</p>

      <div className="space-y-2">
        <p className="font-medium text-sm">Duration</p>
        <div className="flex gap-2">
          {[1, 2, 3].map((durationOption) => (
            <button
              className="rounded border px-3 py-2 text-sm"
              key={durationOption}
              onClick={() => onSetDuration(durationOption)}
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
              onClick={() => onSetToken(tokenAddress)}
              type="button"
            >
              {symbol}
              {selectedToken === tokenAddress ? ' (selected)' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
        Submit wiring is scaffolded but intentionally not connected in Phase 2.
      </div>
    </section>
  )
}
