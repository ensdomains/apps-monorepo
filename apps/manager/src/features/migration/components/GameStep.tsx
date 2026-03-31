import { Trans, useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMigrateNames } from '@/features/migration/hooks/useMigrateNames'
import {
  getMigrationStepCount,
  getMigrationStepDescriptions,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'

type GameStepProps = {
  readonly domains: V1Domain[]
  readonly onComplete: (result: MigrationResult) => void
  readonly onError: (error: string) => void
}

const HUG_DELAY = 3000

/** Extract a readable error message from wagmi/viem nested errors */
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)

  // Walk the cause chain for the deepest message
  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  // viem ContractFunctionRevertedError has shortMessage
  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short

  // Use the deepest cause message if different from top-level
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

export const GameStep = ({ domains, onComplete, onError }: GameStepProps) => {
  const { t } = useLingui()
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const startedRef = useRef(false)
  const [done, setDone] = useState(false)

  const { migrateAsync, progress } = useMigrateNames()
  const { ownerAddress } = useSmartAccountContext()

  const { stepCount, stepDescriptions } = useMemo(() => {
    if (!ownerAddress || domains.length === 0) {
      return { stepCount: 0, stepDescriptions: [] }
    }
    return {
      stepCount: getMigrationStepCount(domains, ownerAddress),
      stepDescriptions: getMigrationStepDescriptions(domains, ownerAddress),
    }
  }, [domains, ownerAddress])

  // Stable refs for callbacks so the effect doesn't depend on them
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const totalSteps = Math.max(stepCount, 1)
  const completedSteps = progress?.currentStep ?? 0

  // Start migration on mount (once)
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (startedRef.current || domains.length === 0) return
    startedRef.current = true

    migrateAsync(domains)
      .then((result) => {
        setDone(true)
        setTimeout(() => onCompleteRef.current(result), HUG_DELAY)
      })
      .catch((err: unknown) => {
        const message = extractErrorMessage(err)
        onErrorRef.current(message)
      })
  }, [])

  // Track width for animation
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
