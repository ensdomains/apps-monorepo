import { motion, useReducedMotion } from 'motion/react'
import { REUNION_SLIDE_MS } from '../state/migrationAnimationTiming'

export const MigrationReunion = () => {
  const reduceMotion = useReducedMotion()
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.img
        alt=""
        className="h-56 w-56 object-contain"
        layoutId="reunited-frens"
        src="/frens/together.svg"
        transition={{
          duration: reduceMotion ? 0 : REUNION_SLIDE_MS / 1000,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </div>
  )
}
