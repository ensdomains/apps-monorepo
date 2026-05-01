import ensMobileSrc from '@/assets/icons/ens-mobile.svg'
import { cn } from '@/lib/utils'

type EnsMobileIconProps = {
  className?: string
}

/**
 * ENS mobile mark as a single-color glyph (inherits `color` / `currentColor`).
 * Uses the same asset geometry as `ens-mobile.svg` via CSS mask.
 */
export const EnsMobileIcon = ({ className }: EnsMobileIconProps) => {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-6 w-[22px] shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${ensMobileSrc}")`,
        WebkitMaskImage: `url("${ensMobileSrc}")`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    />
  )
}
