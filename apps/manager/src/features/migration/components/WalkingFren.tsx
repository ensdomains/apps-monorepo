import { useReducedMotion } from 'motion/react'
import { lazy, Suspense } from 'react'
import type { WalkingFren as WalkingFrenName } from './FrenWalkAnimation'

// Load the player and vector rigs only when the migration scene is rendered.
const FrenWalkAnimation = lazy(() =>
  import('./FrenWalkAnimation').then(({ FrenWalkAnimation }) => ({
    default: FrenWalkAnimation,
  })),
)

export const WalkingFren = ({
  character,
  className,
  isWalking = false,
}: {
  readonly character: WalkingFrenName
  readonly className: string
  readonly isWalking?: boolean
}) => {
  const shouldReduceMotion = useReducedMotion()
  const fallback = (
    <img
      alt=""
      className="h-full w-full object-contain object-bottom"
      src={`/frens/${character === 'earl' ? 'giant' : character}.svg`}
    />
  )

  return (
    <div aria-hidden className={className}>
      {shouldReduceMotion ? (
        fallback
      ) : (
        <Suspense fallback={fallback}>
          <FrenWalkAnimation character={character} isWalking={isWalking} />
        </Suspense>
      )}
    </div>
  )
}
