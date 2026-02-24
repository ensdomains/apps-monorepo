// Shared motion presets for profile section animations.

export const entryAnimation = {
  initial: { opacity: 0, y: -8, filter: 'blur(2px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.98, filter: 'blur(2px)' },
  transition: {
    layout: { type: 'spring', bounce: 0.05, duration: 0.25 },
    opacity: { duration: 0.15 },
    scale: { duration: 0.15 },
    filter: { duration: 0.15 },
    y: { type: 'spring', bounce: 0.1, duration: 0.3 },
  },
} as const

export const pillAnimation = {
  initial: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.95, filter: 'blur(2px)' },
  transition: {
    layout: { type: 'spring', bounce: 0.1, duration: 0.25 },
    default: { duration: 0.12 },
  },
} as const

export const pillContainerAnimation = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { type: 'spring', bounce: 0, duration: 0.3 },
} as const
