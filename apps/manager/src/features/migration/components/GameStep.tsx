import { Trans } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type GameStepProps = {
  readonly onNext: () => void
}

// Bittu is positioned separately (flying above the group)

const STEP_IDS = ['tx-1', 'tx-2', 'tx-3', 'tx-4'] as const
const TOTAL_STEPS = STEP_IDS.length
const HUG_DELAY = 1200
const WALK_ANIMATION_MS = 1200

export const GameStep = ({ onNext }: GameStepProps) => {
  const [completedSteps, setCompletedSteps] = useState(0)
  const [isMoving, setIsMoving] = useState(false)
  const [showHug, setShowHug] = useState(false)

  const allComplete = completedSteps >= TOTAL_STEPS

  const advanceStep = () => {
    if (completedSteps < TOTAL_STEPS) {
      setCompletedSteps((prev) => prev + 1)
    }
  }

  // Track when frens are walking (for bounce animation)
  useEffect(() => {
    if (completedSteps === 0 || allComplete) return
    setIsMoving(true)
    const timer = setTimeout(() => setIsMoving(false), WALK_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [completedSteps, allComplete])

  // Show hug scene after all steps complete
  useEffect(() => {
    if (!allComplete) return

    const timer = setTimeout(() => {
      setShowHug(true)
    }, HUG_DELAY)

    return () => clearTimeout(timer)
  }, [allComplete])

  // Center frens on the current plank.
  // Step 0 → plank 1 center, step 1 → plank 2 center, etc.
  // Bridge spans left-0 to right-[76px], so plank center =
  // (plankIndex + 0.5) / totalSteps of the bridge width.
  const plankIndex = Math.min(completedSteps, TOTAL_STEPS - 1)
  const fraction = (plankIndex + 0.5) / TOTAL_STEPS
  const frensLeft = `calc(${fraction * 100}% - ${fraction * 76}px)`

  return (
    <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-4">
      <style>{`
        @keyframes gentle-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes walk-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

      {/* Title */}
      <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
        {showHug ? (
          <Trans>You've reunited the frENS!</Trans>
        ) : (
          <Trans>Upgrading your names...</Trans>
        )}
      </p>

      {showHug ? (
        <div className="flex flex-col items-center gap-6">
          {/* Together / hug scene */}
          <div className="fade-in zoom-in-95 flex h-[200px] animate-in items-center justify-center duration-700">
            <img alt="" className="h-[180px]" src="/frens/together.svg" />
          </div>

          <p className="font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]">
            <Trans>Good job! You've reunited the frens!</Trans>
          </p>

          <button
            className="rounded-sm bg-ens-garnet-900 px-8 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
            onClick={onNext}
            type="button"
          >
            <Trans>Continue</Trans>
          </button>
        </div>
      ) : (
        <>
          {/* Game scene */}
          <div className="relative h-[200px] w-full">
            {/* Frens group — outer div handles positioning, inner handles bounce */}
            <div
              className="-translate-x-1/2 absolute bottom-[28px] z-10"
              style={{
                left: frensLeft,
                transition: `left ${WALK_ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              <div
                className="flex items-end gap-0.5"
                style={{
                  animation: isMoving
                    ? 'walk-bounce 0.4s ease-in-out infinite'
                    : undefined,
                }}
              >
                <img
                  alt=""
                  className="shrink-0"
                  src="/frens/peanut.svg"
                  style={{ height: 44 }}
                />
                <img
                  alt=""
                  className="shrink-0"
                  src="/frens/lili.svg"
                  style={{ height: 60 }}
                />
                {/* Bittu flies above Kuzco */}
                <div className="relative shrink-0">
                  <img
                    alt=""
                    className="-top-7 -translate-x-1/2 absolute left-1/2"
                    src="/frens/bittu.svg"
                    style={{ height: 24 }}
                  />
                  <img
                    alt=""
                    className="shrink-0"
                    src="/frens/kuzco.svg"
                    style={{ height: 50 }}
                  />
                </div>
              </div>
            </div>

            {/* Giant (Earl) — waits on the right, gently bobbing */}
            <div
              className="absolute right-0 bottom-[16px]"
              style={{ animation: 'gentle-bob 3s ease-in-out infinite' }}
            >
              <img alt="" className="h-[93px]" src="/frens/giant.svg" />
            </div>

            {/* Bridge planks */}
            <div className="absolute right-[76px] bottom-[16px] left-0 flex gap-1.5">
              {STEP_IDS.map((id, i) => (
                <div
                  className={cn(
                    'h-2 flex-1 rounded-[3px] transition-all duration-700',
                    i < completedSteps
                      ? 'bg-ens-garnet-900/70'
                      : 'bg-ens-garnet-900/10',
                  )}
                  key={id}
                />
              ))}
            </div>
          </div>

          {/* Fake button for testing */}
          {completedSteps < TOTAL_STEPS && (
            <button
              className="text-ens-garnet-900/40 text-xs underline"
              onClick={advanceStep}
              type="button"
            >
              fake tx {completedSteps + 1}
            </button>
          )}
        </>
      )}
    </div>
  )
}
