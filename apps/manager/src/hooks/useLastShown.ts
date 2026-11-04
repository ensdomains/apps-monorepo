import { useState } from 'react'

/**
 * The last value that was shown, kept after the value is cleared. A dialog
 * stays on screen through its exit animation (and longer while a wallet hides
 * the tab), so it renders this instead of going blank while it closes.
 */
export const useLastShown = <T>(
  value: T,
  isShown: (value: T) => boolean,
): T => {
  const [lastShown, setLastShown] = useState(value)
  if (isShown(value) && value !== lastShown) setLastShown(value)
  return isShown(value) ? value : lastShown
}
