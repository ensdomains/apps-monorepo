import { cn } from '@/lib/utils'
import surpriseCardRetina from '../assets/surprise-card-upright@2x.webp'
import surpriseCard from '../assets/surprise-card-upright.webp'

export const CommemorativeNftSurpriseCard = ({
  className,
}: {
  readonly className?: string
}) => (
  <div
    aria-hidden
    className={cn(
      'relative aspect-[239.54/338.1] w-60 max-w-full shrink-0',
      className,
    )}
  >
    {/* The Figma export includes the shadow outside the card's frame. */}
    <img
      alt=""
      className="pointer-events-none absolute -top-[0.89%] -left-[4.18%] w-[108.75%] max-w-none select-none"
      decoding="async"
      draggable={false}
      height={718}
      src={surpriseCard}
      srcSet={`${surpriseCard} 1x, ${surpriseCardRetina} 2x`}
      width={521}
    />
  </div>
)
