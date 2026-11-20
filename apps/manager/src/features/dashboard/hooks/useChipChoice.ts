import { useState } from 'react'

type Fallback<T> = { readonly accountsKey: string; readonly value: T }

/**
 * A filter the user picked, saved only on a click. A fallback the table takes
 * on its own holds for these accounts only, so it is taken again when they change.
 */
export const useChipChoice = <T>(initial: T, accountsKey: string) => {
  const [chosen, setChosen] = useState<T>(initial)
  const [fallback, setFallback] = useState<Fallback<T> | null>(null)
  const current =
    fallback?.accountsKey === accountsKey ? fallback.value : chosen

  /** The user's click. */
  const choose = (next: T) => {
    setChosen(next)
    setFallback(null)
  }
  /** Called while rendering; keeps an emptied filter from reopening. */
  const fallBackTo = (next: T) => {
    if (next !== current) setFallback({ accountsKey, value: next })
  }

  return { current, choose, fallBackTo }
}
