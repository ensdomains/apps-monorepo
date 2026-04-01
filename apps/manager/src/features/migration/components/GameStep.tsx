import { Trans, useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useMigrationExecution } from '@/features/migration/hooks/useMigrationExecution'
import type { MigrationResult } from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { cn } from '@/lib/utils'

type GameStepProps = {
  readonly domains: V1Domain[]
  readonly onComplete: (result: MigrationResult) => void
  readonly onError: (error: string) => void
}

const HUG_DELAY = 3000

export const GameStep = ({ domains, onComplete, onError }: GameStepProps) => {
  const { t } = useLingui()
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)

  const { done, progress, stepCount, stepDescriptions } = useMigrationExecution(
    domains,
    onComplete,
    onError,
    HUG_DELAY,
  )

  const totalSteps = Math.max(stepCount, 1)
  const completedSteps = progress?.currentStep ?? 0

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

  const plankIndex = Math.min(completedSteps, totalSteps - 1)
  const frensX =
    trackWidth > 0 ? ((plankIndex + 0.5) / totalSteps) * trackWidth : 0

  // Excited when tx is signed but step hasn't completed yet
  const isExcited = !!progress?.txHash && !done

  const descriptionText = done
    ? t`Almost there...`
    : completedSteps < stepDescriptions.length
      ? `${stepDescriptions[completedSteps]}...`
      : t`Preparing migration...`

  const stepIds = Array.from({ length: totalSteps }, (_, i) => `step-${i}`)

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
            animate={{ opacity: done ? 0 : 1 }}
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
                  <motion.img
                    alt=""
                    animate={
                      isExcited
                        ? { y: [0, -12, 0], rotate: [0, -5, 5, 0] }
                        : { y: 0, rotate: 0 }
                    }
                    className="shrink-0"
                    src="/frens/peanut.svg"
                    style={{ height: 44 }}
                    transition={
                      isExcited
                        ? {
                            duration: 0.5,
                            repeat: Number.POSITIVE_INFINITY,
                            repeatDelay: 0.1,
                          }
                        : { duration: 0.3 }
                    }
                  />
                  <motion.img
                    alt=""
                    animate={
                      isExcited
                        ? { y: [0, -16, 0], rotate: [0, 4, -4, 0] }
                        : { y: 0, rotate: 0 }
                    }
                    className="shrink-0"
                    src="/frens/lili.svg"
                    style={{ height: 60 }}
                    transition={
                      isExcited
                        ? {
                            duration: 0.6,
                            repeat: Number.POSITIVE_INFINITY,
                            repeatDelay: 0.05,
                            delay: 0.1,
                          }
                        : { duration: 0.3 }
                    }
                  />
                  <div className="relative shrink-0">
                    <motion.img
                      alt=""
                      animate={
                        isExcited
                          ? { y: [0, -20, -10, 0], x: [0, 5, -5, 0] }
                          : { y: [0, -6, -3, 0] }
                      }
                      className="-translate-x-1/2 absolute left-1/2"
                      src="/frens/bittu.svg"
                      style={{ height: 24, top: -30 }}
                      transition={
                        isExcited
                          ? {
                              duration: 0.8,
                              ease: 'easeInOut',
                              repeat: Number.POSITIVE_INFINITY,
                            }
                          : {
                              duration: 4,
                              ease: 'easeInOut',
                              repeat: Number.POSITIVE_INFINITY,
                            }
                      }
                    />
                    <motion.img
                      alt=""
                      animate={
                        isExcited
                          ? { y: [0, -10, 0], rotate: [0, -3, 3, 0] }
                          : { y: 0, rotate: 0 }
                      }
                      className="shrink-0"
                      src="/frens/kuzco.svg"
                      style={{ height: 50 }}
                      transition={
                        isExcited
                          ? {
                              duration: 0.55,
                              repeat: Number.POSITIVE_INFINITY,
                              repeatDelay: 0.15,
                              delay: 0.2,
                            }
                          : { duration: 0.3 }
                      }
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              animate={
                isExcited
                  ? { y: [0, -14, 0], scale: [1, 1.05, 1] }
                  : { y: [0, -6, 0] }
              }
              className="absolute right-0 bottom-[10px]"
              transition={
                isExcited
                  ? {
                      duration: 0.7,
                      ease: 'easeInOut',
                      repeat: Number.POSITIVE_INFINITY,
                    }
                  : {
                      duration: 4,
                      ease: 'easeInOut',
                      repeat: Number.POSITIVE_INFINITY,
                    }
              }
            >
              <img alt="" className="h-[93px]" src="/frens/giant.svg" />
            </motion.div>

            <div className="absolute right-[90px] bottom-[10px] left-0">
              <div className="mb-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />

              <div className="flex items-stretch gap-1.5">
                <div className="w-1 rounded-sm bg-ens-garnet-900/40" />
                {stepIds.map((id, i) => {
                  const stepDone = i < completedSteps
                  return (
                    <div className="flex flex-1 items-stretch" key={id}>
                      <motion.div
                        animate={
                          stepDone ? { scaleX: 1, opacity: 1 } : undefined
                        }
                        className={cn(
                          'h-[22px] flex-1 origin-left rounded-[3px] border-x-[3px]',
                          stepDone
                            ? 'border-ens-garnet-900/50 bg-ens-garnet-900/45 shadow-[inset_0_-3px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]'
                            : 'border-ens-garnet-900/8 bg-ens-garnet-900/4',
                        )}
                        initial={
                          stepDone ? { scaleX: 0, opacity: 0 } : undefined
                        }
                        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      />
                      <div
                        className={cn(
                          'ml-1.5 w-1 rounded-sm',
                          stepDone
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
              done ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }
            }
            className="absolute inset-0 flex items-center justify-center"
            transition={
              done
                ? { type: 'spring', bounce: 0.4, duration: 0.8, delay: 0.3 }
                : { duration: 0 }
            }
          >
            <img alt="" className="h-[180px]" src="/frens/together.svg" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
