import { type RefCallback, useCallback } from 'react'

const HEIGHT_PROPERTY = '--palette-viewport-height'
const TOP_PROPERTY = '--palette-viewport-top'

const restoreProperty = (
  surface: HTMLElement,
  property: string,
  previous: string,
) => {
  if (previous) surface.style.setProperty(property, previous)
  else surface.style.removeProperty(property)
}

export const usePaletteViewport = ({
  isOpen,
  isMobile,
}: {
  readonly isOpen: boolean
  readonly isMobile: boolean
}): RefCallback<HTMLDivElement> =>
  useCallback(
    (surface: HTMLDivElement | null) => {
      const viewport = window.visualViewport
      if (!surface || !isOpen || !isMobile || !viewport) return
      const previousHeight = surface.style.getPropertyValue(HEIGHT_PROPERTY)
      const previousTop = surface.style.getPropertyValue(TOP_PROPERTY)
      const update = () => {
        if (viewport.height <= 0) return
        const height = `${viewport.height}px`
        const top = `${viewport.offsetTop}px`
        if (surface.style.getPropertyValue(HEIGHT_PROPERTY) !== height)
          surface.style.setProperty(HEIGHT_PROPERTY, height)
        if (surface.style.getPropertyValue(TOP_PROPERTY) !== top)
          surface.style.setProperty(TOP_PROPERTY, top)
      }
      update()
      viewport.addEventListener('resize', update, { passive: true })
      viewport.addEventListener('scroll', update, { passive: true })
      return () => {
        viewport.removeEventListener('resize', update)
        viewport.removeEventListener('scroll', update)
        restoreProperty(surface, HEIGHT_PROPERTY, previousHeight)
        restoreProperty(surface, TOP_PROPERTY, previousTop)
      }
    },
    [isOpen, isMobile],
  )
