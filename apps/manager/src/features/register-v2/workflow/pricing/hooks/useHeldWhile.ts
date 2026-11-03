import { useState } from 'react'

/** `value` as it was when `isHeld` turned true, until it turns false again. */
export const useHeldWhile = <T>(value: T, isHeld: boolean): T => {
  const [held, setHeld] = useState<{ readonly value: T } | undefined>()
  if (isHeld && !held) setHeld({ value })
  if (!isHeld && held) setHeld(undefined)
  return isHeld && held ? held.value : value
}
