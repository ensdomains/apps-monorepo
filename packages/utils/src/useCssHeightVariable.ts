import { type RefObject, useLayoutEffect } from 'react'

/** Mirrors an element's rendered height into a root CSS variable, `0px` when absent. */
export const useCssHeightVariable = (
  ref: RefObject<HTMLElement | null>,
  variable: string,
): void => {
  useLayoutEffect(() => {
    const root = document.documentElement
    const element = ref.current
    if (!element) {
      root.style.setProperty(variable, '0px')
      return
    }
    const update = () =>
      root.style.setProperty(variable, `${element.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.setProperty(variable, '0px')
    }
  })
}
