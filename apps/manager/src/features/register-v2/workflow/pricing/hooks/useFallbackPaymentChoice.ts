import { useEffect, useEffectEvent } from 'react'
import { match } from 'ts-pattern'
import type { TOKEN_SYMBOL } from '@/lib/tokens'
import type { PaymentChoice } from '../lib/fallbackPaymentChoice'

const choiceKey = (choice: PaymentChoice | undefined) =>
  match(choice)
    .with(undefined, () => undefined)
    .with({ kind: 'wallet' }, ({ symbol }) => `wallet:${symbol}`)
    .with({ kind: 'l2' }, ({ chainId }) => `l2:${chainId}`)
    .exhaustive()

/** Moves the selection to `choice` once the methods have settled. */
export const useFallbackPaymentChoice = <T extends TOKEN_SYMBOL>({
  choice,
  isSettled,
  onSelectCoin,
  onSelectL2,
}: {
  readonly choice: PaymentChoice | undefined
  readonly isSettled: boolean
  readonly onSelectCoin: (coin: T) => void
  readonly onSelectL2: ((chainId: number) => void) | undefined
}) => {
  const key = choiceKey(choice)
  const select = useEffectEvent(() =>
    match(choice)
      .with(undefined, () => undefined)
      .with({ kind: 'wallet' }, ({ symbol }) => onSelectCoin(symbol as T))
      .with({ kind: 'l2' }, ({ chainId }) => onSelectL2?.(chainId))
      .exhaustive(),
  )

  // Keyed by the choice, not its object, which is rebuilt every render
  useEffect(() => {
    if (isSettled && key !== undefined) select()
  }, [isSettled, key])
}
