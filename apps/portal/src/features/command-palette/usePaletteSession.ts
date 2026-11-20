import { useCallback, useMemo, useRef } from 'react'

export const usePaletteSession = () => {
  const generation = useRef(0)
  const invalidate = useCallback(() => {
    generation.current += 1
  }, [])
  const capture = useCallback(() => generation.current, [])
  const isCurrent = useCallback(
    (request: number) => generation.current === request,
    [],
  )
  return useMemo(
    () => ({ invalidate, capture, isCurrent }),
    [invalidate, capture, isCurrent],
  )
}
