// Shared motion presets for profile section animations.

const empty = {}

export const entryAnimation = (reduceMotion?: boolean | null) =>
  reduceMotion
    ? empty
    : ({
        initial: { opacity: 0, y: -6, filter: 'blur(2px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.98, filter: 'blur(2px)' },
        layout: true,
        transition: {
          layout: { type: 'spring', bounce: 0, duration: 0.15 },
          opacity: { duration: 0.1 },
          scale: { duration: 0.1 },
          filter: { duration: 0.1 },
          y: { type: 'spring', bounce: 0, duration: 0.2 },
        },
      } as const)

export const pillAnimation = (reduceMotion?: boolean | null) =>
  reduceMotion
    ? empty
    : ({
        initial: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.95, filter: 'blur(2px)' },
        layout: true,
        transition: {
          layout: { type: 'spring', bounce: 0, duration: 0.15 },
          default: { duration: 0.08 },
        },
      } as const)

export const pillContainerAnimation = (reduceMotion?: boolean | null) =>
  reduceMotion
    ? empty
    : ({
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: 'auto' },
        exit: { opacity: 0, height: 0 },
        transition: { type: 'spring', bounce: 0, duration: 0.2 },
      } as const)
