import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import type { MigrationSuccessDialogState } from './MigrationSuccessDialog.types'

type Point = { readonly x: number; readonly y: number }

const centerOf = (element: Element): Point => {
  const bounds = element.getBoundingClientRect()
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  }
}

const slideFrom = (
  element: HTMLElement,
  origin: Point,
  delay: number,
  scale = 0.55,
): Animation => {
  const target = centerOf(element)
  const animation = element.animate(
    [
      {
        opacity: scale === 1 ? 1 : 0,
        transform: `translate3d(${origin.x - target.x}px, ${origin.y - target.y}px, 0) scale(${scale})`,
      },
      { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
    ],
    {
      delay,
      duration: 480,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    },
  )
  animation.onfinish = () => animation.cancel()
  return animation
}

export const useNftShareEntrance = (
  status: MigrationSuccessDialogState['status'],
) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousMinted = useRef(status === 'minted')
  const traitsOrigin = useRef<Point | undefined>(undefined)
  const reduceMotion = useReducedMotion()

  useLayoutEffect(() => {
    const minted = status === 'minted'
    const container = containerRef.current
    const traitsButton = container?.querySelector<HTMLElement>(
      '[data-nft-traits-trigger]',
    )
    const wasMinted = previousMinted.current
    previousMinted.current = minted

    if (!minted) {
      if (traitsButton) traitsOrigin.current = centerOf(traitsButton)
      return
    }
    if (wasMinted || reduceMotion || !traitsButton) return

    const origin = traitsOrigin.current ?? centerOf(traitsButton)
    const animations: Animation[] = []
    const currentTraitsPosition = centerOf(traitsButton)
    if (
      Math.abs(origin.x - currentTraitsPosition.x) > 1 ||
      Math.abs(origin.y - currentTraitsPosition.y) > 1
    ) {
      animations.push(slideFrom(traitsButton, origin, 0, 1))
    }

    const actions = container?.querySelectorAll<HTMLElement>(
      '[data-nft-share-action]',
    )
    actions?.forEach((action, index) => {
      animations.push(slideFrom(action, origin, index * 45))
    })

    return () => {
      for (const animation of animations) animation.cancel()
    }
  }, [status, reduceMotion])

  return containerRef
}
