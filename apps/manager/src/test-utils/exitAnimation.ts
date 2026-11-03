import { vi } from 'vitest'

/**
 * jsdom has no CSS animations, so Radix unmounts a closing dialog at once. In
 * a browser it stays on screen until its exit animation ends, and longer when
 * the tab is hidden behind a mobile wallet. This reports an animation on every
 * element carrying `data-state`, so a closing dialog stays mounted until the
 * test fires `animationend`.
 */
export const keepClosingDialogsMounted = () => {
  const getComputedStyle = window.getComputedStyle.bind(window)
  return vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element, pseudo) => {
      const styles = getComputedStyle(element, pseudo)
      if (!element.hasAttribute('data-state')) return styles
      return new Proxy(styles, {
        get: (target, property) => {
          if (property === 'animationName')
            return `${element.getAttribute('data-state')}-animation`
          const value: unknown = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    })
}
