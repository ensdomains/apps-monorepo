import { Trans, useLingui } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type GameStepProps = {
  readonly onNext: () => void
}

const STEP_IDS = ['tx-1', 'tx-2', 'tx-3', 'tx-4'] as const
const TOTAL_STEPS = STEP_IDS.length
const HUG_DELAY = 1200
const SLIDE_MS = 1000

export const GameStep = ({ onNext }: GameStepProps) => {
  const { t } = useLingui()
  const [completedSteps, setCompletedSteps] = useState(0)
  const [showHug, setShowHug] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)

  const allComplete = completedSteps >= TOTAL_STEPS

  const stepDescriptions = [
    t`Approving migration`,
    t`Transferring ownership`,
    t`Setting resolver`,
    t`Finalizing upgrade`,
  ]

  const advanceStep = () => {
    if (completedSteps < TOTAL_STEPS) {
      setCompletedSteps((prev) => prev + 1)
    }
  }

  // Measure bridge track width for pixel-perfect transform positioning
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setTrackWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Show hug scene after all steps complete
  useEffect(() => {
    if (!allComplete) return
    const timer = setTimeout(() => setShowHug(true), HUG_DELAY)
    return () => clearTimeout(timer)
  }, [allComplete])

  // Frens X position in pixels — center of current plank
  // Using transform: translateX (GPU-composited, no layout thrashing)
  const plankIndex = Math.min(completedSteps, TOTAL_STEPS - 1)
  const frensX =
    trackWidth > 0 ? ((plankIndex + 0.5) / TOTAL_STEPS) * trackWidth : 0

  // ── Hug scene (separate render path — no shared layout with game) ──
  if (showHug) {
    return (
      <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5">
        <p className="mb-4 text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
          <Trans>You've reunited the frENS!</Trans>
        </p>

        <div className="relative flex h-[240px] items-center justify-center">
          <div className="absolute h-48 w-48 rounded-full bg-[#e72a96]/8 blur-3xl" />
          <img
            alt=""
            className="relative h-[200px]"
            src="/frens/together.svg"
            style={{
              willChange: 'transform, opacity',
              animation:
                'hug-entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}
          />
        </div>

        <p className="mt-2 font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]">
          <Trans>Good job! You've reunited the frens!</Trans>
        </p>

        <button
          className="mt-6 rounded-sm bg-ens-garnet-900 px-8 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
          onClick={onNext}
          type="button"
        >
          <Trans>Continue</Trans>
        </button>
      </div>
    )
  }

  // ── Game scene ──
  return (
    <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5">
      {/*
       * Fixed-height shell: every child has explicit height so
       * justify-center never recalculates when content swaps.
       */}
      <div
        className="flex w-full flex-col items-center"
        style={{ height: 400 }}
      >
        {/* Title */}
        <div className="flex h-11 shrink-0 items-center">
          <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Upgrading your names...</Trans>
          </p>
        </div>

        {/* Step description */}
        <div className="flex h-6 shrink-0 items-center">
          <p className="font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]">
            {completedSteps < TOTAL_STEPS
              ? `${stepDescriptions[completedSteps]}...`
              : t`Almost there...`}
          </p>
        </div>

        {/* Game scene — all children absolutely positioned */}
        <div className="relative mt-2 h-[280px] w-full shrink-0">
          {/* Frens track — same width as bridge, used for positioning */}
          <div
            className="absolute right-[90px] bottom-[42px] left-0 z-10"
            ref={trackRef}
          >
            <div
              className="absolute bottom-0 left-0"
              style={{
                willChange: 'transform',
                transform: `translateX(${frensX}px) translateX(-50%)`,
                transition: `transform ${SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              <div className="flex items-end gap-1">
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
                {/* Bittu floats above Kuzco */}
                <div className="relative shrink-0">
                  <img
                    alt=""
                    className="absolute left-1/2"
                    src="/frens/bittu.svg"
                    style={{
                      height: 24,
                      top: -30,
                      willChange: 'transform',
                      animation: 'bittu-float 4s ease-in-out infinite',
                    }}
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
          </div>

          {/* Giant (Earl) */}
          <div
            className="absolute right-0 bottom-[10px]"
            style={{
              willChange: 'transform',
              animation: 'gentle-bob 4s ease-in-out infinite',
            }}
          >
            <img alt="" className="h-[93px]" src="/frens/giant.svg" />
          </div>

          {/* Rope Bridge */}
          <div className="absolute right-[90px] bottom-[10px] left-0">
            {/* Top rope */}
            <div className="mb-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />

            {/* Planks with posts */}
            <div className="flex items-stretch gap-[10px]">
              <div className="w-1 rounded-sm bg-ens-garnet-900/40" />
              {STEP_IDS.map((id, i) => {
                const done = i < completedSteps
                return (
                  <div className="flex flex-1 items-stretch" key={id}>
                    <div
                      className={cn(
                        'h-[22px] flex-1 origin-left rounded-[3px] border-x-[3px] transition-colors duration-500',
                        done
                          ? 'border-ens-garnet-900/50 bg-ens-garnet-900/45 shadow-[inset_0_-3px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]'
                          : 'border-ens-garnet-900/8 bg-ens-garnet-900/4',
                      )}
                      style={
                        done
                          ? {
                              willChange: 'transform, opacity',
                              animation:
                                'plank-extend 0.6s cubic-bezier(0.4, 0, 0.2, 1) both',
                            }
                          : undefined
                      }
                    />
                    <div
                      className={cn(
                        'ml-[10px] w-1 rounded-sm transition-colors duration-500',
                        done ? 'bg-ens-garnet-900/40' : 'bg-ens-garnet-900/10',
                      )}
                    />
                  </div>
                )
              })}
            </div>

            {/* Bottom rope */}
            <div className="mt-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />
          </div>

          {/* Ground line */}
          <div className="absolute right-0 bottom-[9px] left-0 h-px bg-ens-garnet-900/5" />
        </div>

        {/* Progress dots */}
        <div className="flex h-5 shrink-0 items-center gap-2">
          {STEP_IDS.map((id, i) => (
            <div
              className={cn(
                'rounded-full transition-all duration-500',
                i < completedSteps
                  ? 'size-2 bg-ens-garnet-900'
                  : i === completedSteps
                    ? 'size-2.5 bg-[#e72a96]'
                    : 'size-1.5 bg-ens-garnet-900/20',
              )}
              key={id}
            />
          ))}
        </div>

        {/* Fake test button */}
        <div className="flex h-5 shrink-0 items-center">
          {completedSteps < TOTAL_STEPS && (
            <button
              className="text-ens-garnet-900/40 text-xs underline"
              onClick={advanceStep}
              type="button"
            >
              fake tx {completedSteps + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
