import type { AnimationItem } from 'lottie-web'
import lottie from 'lottie-web/build/player/lottie_light'
import { useEffect, useRef } from 'react'
import bittu from './walk-animations/bittu.json'
import earl from './walk-animations/earl.json'
import kuzco from './walk-animations/kuzco.json'
import peanut from './walk-animations/peanut.json'

const animations = { bittu, earl, kuzco, peanut }

// Crop export padding, keeping room for the full stride and tentacle motion.
const viewBoxes = {
  bittu: '15 25 415 235',
  earl: '85 60 570 715',
  kuzco: '45 20 440 500',
  peanut: '130 50 250 380',
}

export type WalkingFren = keyof typeof animations

const useWalkAnimation = (character: WalkingFren, isWalking: boolean) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<AnimationItem | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const animation = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      // Lottie mutates its data while resolving shapes; each instance owns a copy.
      animationData: structuredClone(animations[character]),
      rendererSettings: {
        preserveAspectRatio: 'xMidYMax meet',
        viewBoxSize: viewBoxes[character],
      },
    })
    animationRef.current = animation
    return () => {
      animationRef.current = null
      animation.destroy()
    }
  }, [character])

  // Rebind playback when a different character creates a new player instance.
  // biome-ignore lint/correctness/useExhaustiveDependencies: character replaces animationRef in the effect above.
  useEffect(() => {
    const animation = animationRef.current
    const syncPlayback = () => {
      if (isWalking && !document.hidden) animation?.play()
      else animation?.goToAndStop(0, true)
    }
    syncPlayback()
    document.addEventListener('visibilitychange', syncPlayback)
    return () => document.removeEventListener('visibilitychange', syncPlayback)
  }, [character, isWalking])

  return containerRef
}

export const FrenWalkAnimation = ({
  character,
  isWalking,
}: {
  readonly character: WalkingFren
  readonly isWalking: boolean
}) => {
  const ref = useWalkAnimation(character, isWalking)
  return <div aria-hidden className="h-full w-full" ref={ref} />
}
