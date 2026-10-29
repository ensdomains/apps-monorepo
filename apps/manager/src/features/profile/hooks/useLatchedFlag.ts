import { useRef } from 'react'

/** Stays true once `isOn` has been true, until `resetKey` changes. */
export const useLatchedFlag = (isOn: boolean, resetKey: string) => {
  const latch = useRef({ resetKey, isOn })
  if (latch.current.resetKey !== resetKey) {
    latch.current = { resetKey, isOn }
  } else if (isOn && !latch.current.isOn) {
    latch.current = { resetKey, isOn: true }
  }
  return latch.current.isOn
}
