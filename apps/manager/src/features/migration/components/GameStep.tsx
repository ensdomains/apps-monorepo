import { Trans, useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type GameStepProps = {
  readonly onNext: () => void
}

const STEP_IDS = ['tx-1', 'tx-2', 'tx-3', 'tx-4'] as const
const TOTAL_STEPS = STEP_IDS.length
const HUG_DELAY = 3000

export const GameStep = ({ onNext }: GameStepProps) => {
  const { t } = useLingui()
  const [completedSteps, setCompletedSteps] = useState(0)
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

  useEffect(() => {
    if (!allComplete) return
    const timer = setTimeout(() => onNext(), HUG_DELAY)
    return () => clearTimeout(timer)
  }, [allComplete, onNext])

  const plankIndex = Math.min(completedSteps, TOTAL_STEPS - 1)
  const frensX =
    trackWidth > 0 ? ((plankIndex + 0.5) / TOTAL_STEPS) * trackWidth : 0

  const descriptionText =
    completedSteps < TOTAL_STEPS
      ? `${stepDescriptions[completedSteps]}...`
      : t`Almost there...`

  return (
    <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5">
      <div
        className="flex w-full flex-col items-center"
        style={{ height: 400 }}
      >
        <div className="flex h-11 shrink-0 items-center">
          <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Upgrading your names...</Trans>
          </p>
        </div>

        <div className="flex h-6 shrink-0 items-center overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              className="font-semi-mono text-[#e72a96] text-xs uppercase tracking-[0.12px]"
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              key={descriptionText}
              transition={{ duration: 0.3 }}
            >
              {descriptionText}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="relative mt-2 h-[280px] w-full shrink-0">
          <motion.div
            animate={{ opacity: allComplete ? 0 : 1 }}
            className="absolute inset-0"
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div
              className="absolute right-[90px] bottom-[42px] left-0 z-10"
              ref={trackRef}
            >
              <motion.div
                animate={{ x: frensX }}
                className="-translate-x-1/2 absolute bottom-0 left-0"
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
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
                  <div className="relative shrink-0">
                    <motion.img
                      alt=""
                      animate={{ y: [0, -6, -3, 0] }}
                      className="-translate-x-1/2 absolute left-1/2"
                      src="/frens/bittu.svg"
                      style={{ height: 24, top: -30 }}
                      transition={{
                        duration: 4,
                        ease: 'easeInOut',
                        repeat: Number.POSITIVE_INFINITY,
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
              </motion.div>
            </div>

            <motion.div
              animate={{ y: [0, -6, 0] }}
              className="absolute right-0 bottom-[10px]"
              transition={{
                duration: 4,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
              }}
            >
              <img alt="" className="h-[93px]" src="/frens/giant.svg" />
            </motion.div>

            <div className="absolute right-[90px] bottom-[10px] left-0">
              <div className="mb-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />

              <div className="flex items-stretch gap-1.5">
                <div className="w-1 rounded-sm bg-ens-garnet-900/40" />
                {STEP_IDS.map((id, i) => {
                  const done = i < completedSteps
                  return (
                    <div className="flex flex-1 items-stretch" key={id}>
                      <motion.div
                        animate={done ? { scaleX: 1, opacity: 1 } : undefined}
                        className={cn(
                          'h-[22px] flex-1 origin-left rounded-[3px] border-x-[3px]',
                          done
                            ? 'border-ens-garnet-900/50 bg-ens-garnet-900/45 shadow-[inset_0_-3px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]'
                            : 'border-ens-garnet-900/8 bg-ens-garnet-900/4',
                        )}
                        initial={done ? { scaleX: 0, opacity: 0 } : undefined}
                        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      />
                      <div
                        className={cn(
                          'ml-1.5 w-1 rounded-sm',
                          done
                            ? 'bg-ens-garnet-900/40'
                            : 'bg-ens-garnet-900/10',
                        )}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="mt-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />
            </div>

            <div className="absolute right-[90px] bottom-[9px] left-0 h-px bg-ens-garnet-900/5" />
          </motion.div>

          <motion.div
            animate={
              allComplete
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.5 }
            }
            className="absolute inset-0 flex items-center justify-center"
            transition={
              allComplete
                ? { type: 'spring', bounce: 0.4, duration: 0.8, delay: 0.3 }
                : { duration: 0 }
            }
          >
            <img alt="" className="h-[180px]" src="/frens/together.svg" />
          </motion.div>
        </div>

        <div className="flex h-5 shrink-0 items-center gap-2">
          {STEP_IDS.map((id, i) => (
            <motion.div
              animate={{
                scale: i === completedSteps ? 1.3 : 1,
                backgroundColor:
                  i < completedSteps
                    ? 'var(--color-ens-garnet-900)'
                    : i === completedSteps
                      ? '#e72a96'
                      : 'rgba(74, 3, 38, 0.2)',
              }}
              className="size-2 rounded-full"
              key={id}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
          ))}
        </div>

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
