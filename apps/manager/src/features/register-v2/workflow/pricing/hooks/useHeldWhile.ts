import { useRef } from 'react'

/** `value` as it was when `isHeld` turned on, until it turns off. */
export const useHeldWhile = <T>(isHeld: boolean, value: T): T => {
  const held = useRef<{ readonly value: T } | undefined>(undefined)
  if (!isHeld) held.current = undefined
  else if (!held.current) held.current = { value }
  return held.current ? held.current.value : value
}
