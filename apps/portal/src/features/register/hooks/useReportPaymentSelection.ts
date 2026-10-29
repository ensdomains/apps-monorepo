import { useEffect, useEffectEvent } from 'react'

/**
 * The parent holds the selection (and its price) to submit with, so tell it
 * whenever `key` changes: a new token, a new price, or nothing selectable.
 */
export const useReportPaymentSelection = <T>(
  selection: T | null,
  key: string | null,
  onSelectionChange: (selection: T | null) => void,
) => {
  const report = useEffectEvent((_key: string | null) =>
    onSelectionChange(selection),
  )
  useEffect(() => report(key), [key])
}
