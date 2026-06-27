import { Trans, useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion } from 'motion/react'
import { useElementWidth } from '@/features/migration/hooks/useElementWidth'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrateSubstep,
  useMigrationProgress,
  useMigrationStep,
  useMigrationStepDescriptors,
  useRenewGraceSubstep,
} from '@/features/migration/state/migrationUi.selectors'
import { cn } from '@/lib/utils'
import {
  type CollapseTransition,
  computeBridgeLayout,
  describeNextStep,
  displayStepOf,
  formatStepDescription,
  giantAnimateFor,
  giantModeOf,
  giantTransitionFor,
  VISIBLE_PLANKS,
} from './GameStep.helpers'

const GameHeading = ({
  descriptionText,
  displayStep,
  hasCollapsed,
  isRenewalStep,
  totalSteps,
}: {
  readonly descriptionText: string
  readonly displayStep: number
  readonly hasCollapsed: boolean
  readonly isRenewalStep: boolean
  readonly totalSteps: number
}) => (
  <>
    <motion.div
      animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
      className="flex h-11 shrink-0 items-center"
      transition={{ duration: 0.3 }}
    >
      <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
        {isRenewalStep ? (
          <Trans>Renewing your names...</Trans>
        ) : (
          <Trans>Upgrading your names...</Trans>
        )}
      </p>
    </motion.div>

    <motion.div
      animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
      className="flex h-6 shrink-0 items-center overflow-hidden"
      transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          className="font-semi-mono text-ens-garnet-500 text-xs uppercase tracking-[0.12px]"
          exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          key={descriptionText}
          transition={{ duration: 0.3 }}
        >
          {descriptionText}
        </motion.span>
      </AnimatePresence>
    </motion.div>

    {totalSteps > 1 && (
      <motion.div
        animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
        className="mt-1 flex h-4 shrink-0 items-center"
        transition={{ duration: 0.3 }}
      >
        <span className="font-semi-mono text-[10px] text-ens-garnet-400 uppercase tabular-nums tracking-[0.12px]">
          {displayStep}/{totalSteps}
        </span>
      </motion.div>
    )}
  </>
)

type BridgePlankProps = {
  readonly collapseTransition: CollapseTransition
  readonly hasCollapsed: boolean
  readonly id: string
  readonly index: number
  readonly plankWidth: number
  readonly stepDone: boolean
}

const BridgePlank = ({
  collapseTransition,
  hasCollapsed,
  id,
  index,
  plankWidth,
  stepDone,
}: BridgePlankProps) => (
  <motion.div
    animate={
      hasCollapsed
        ? {
            y: 40 + (index % VISIBLE_PLANKS) * 15,
            rotate: index % 2 === 0 ? 12 : -10,
            opacity: 0,
          }
        : { y: 0, rotate: 0, opacity: 1 }
    }
    className="flex items-stretch"
    key={id}
    style={{ width: plankWidth - 6 }}
    transition={
      hasCollapsed
        ? {
            ...collapseTransition,
            delay: 0.05 + (index % VISIBLE_PLANKS) * 0.06,
          }
        : { duration: 0 }
    }
  >
    <motion.div
      animate={stepDone ? { scaleX: 1, opacity: 1 } : undefined}
      className={cn(
        'h-6 flex-1 origin-left rounded-[3px] border-x-[3px]',
        stepDone
          ? 'border-ens-garnet-900/50 bg-ens-garnet-900/45 shadow-[inset_0_-3px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'border-ens-garnet-900/8 bg-ens-garnet-900/4',
      )}
      initial={stepDone ? { scaleX: 0, opacity: 0 } : undefined}
      transition={{
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
    />
    <motion.div
      animate={
        hasCollapsed
          ? {
              y: 30 + (index % VISIBLE_PLANKS) * 10,
              rotate: index % 2 === 0 ? -15 : 8,
              opacity: 0,
            }
          : { y: 0, rotate: 0, opacity: 1 }
      }
      className={cn(
        'ml-1.5 w-1 shrink-0 rounded-sm',
        stepDone ? 'bg-ens-garnet-900/40' : 'bg-ens-garnet-900/10',
      )}
      transition={
        hasCollapsed
          ? {
              ...collapseTransition,
              delay: 0.08 + (index % VISIBLE_PLANKS) * 0.06,
            }
          : { duration: 0 }
      }
    />
  </motion.div>
)

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: animation state stays together so the bridge, frens, and giant remain synchronized.
export const GameStep = () => {
  const { t } = useLingui()
  const { ref: trackRef, width: trackWidth } = useElementWidth()

  const { uiActor } = useMigrationUiContext()
  const step = useMigrationStep(uiActor)
  const migrateSubstep = useMigrateSubstep(uiActor)
  const renewGraceSubstep = useRenewGraceSubstep(uiActor)
  const substep = migrateSubstep ?? renewGraceSubstep
  const progress = useMigrationProgress(uiActor)
  const stepDescriptors = useMigrationStepDescriptors(uiActor)
  const isRenewalStep = step === 'renewGrace'

  const done = substep === 'succeeding'
  const hasCollapsed = substep === 'failing'

  const totalSteps = Math.max(progress?.totalSteps ?? stepDescriptors.length, 1)
  const completedSteps = progress?.currentStep ?? 0
  const displayStep = displayStepOf(done, completedSteps, totalSteps)
  const { plankWidth, frensX, scrollOffset, totalBridgeWidth } =
    computeBridgeLayout({ totalSteps, completedSteps, trackWidth })

  const isExcited = !!progress?.txHash && !done && !hasCollapsed

  const nextDescriptor = stepDescriptors[completedSteps] as
    | MigrationStepDescriptor
    | undefined

  const stepDescription = describeNextStep({
    done,
    progressDescription: progress?.description,
    descriptor: nextDescriptor,
  })
  const descriptionText = formatStepDescription(stepDescription, t)

  const stepIds = Array.from({ length: totalSteps }, (_, i) => `step-${i}`)

  const collapseTransition = {
    duration: 0.8,
    ease: [0.55, 0, 1, 0.45] as const,
  }

  const giantMode = giantModeOf({ hasCollapsed, isExcited })
  const giantAnimate = giantAnimateFor(giantMode)
  const giantTransition = giantTransitionFor(giantMode)

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-5 md:px-8">
      <div className="flex h-full w-full flex-col items-center justify-center">
        <GameHeading
          descriptionText={descriptionText}
          displayStep={displayStep}
          hasCollapsed={hasCollapsed}
          isRenewalStep={isRenewalStep}
          totalSteps={totalSteps}
        />

        <div className="relative mt-4 h-[360px] w-full max-w-[1040px] shrink-0">
          <motion.div
            animate={{ opacity: done ? 0 : 1 }}
            className="absolute inset-0"
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div
              className="absolute right-[120px] bottom-[70px] left-0 z-10"
              ref={trackRef}
            >
              <motion.div
                animate={
                  hasCollapsed
                    ? { x: frensX, y: 300, rotate: 15, opacity: 0 }
                    : { x: frensX }
                }
                className="absolute bottom-0 left-0 -translate-x-1/2"
                transition={
                  hasCollapsed
                    ? { duration: 1, ease: [0.36, 0, 0.66, -0.56] }
                    : { type: 'spring', stiffness: 80, damping: 18 }
                }
              >
                <div className="flex items-end gap-1">
                  <motion.img
                    alt=""
                    animate={
                      isExcited
                        ? { y: [0, -12, 0], rotate: [0, -5, 5, 0] }
                        : { y: 0, rotate: 0 }
                    }
                    className="h-[54px] shrink-0"
                    src="/frens/peanut.svg"
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
                    className="h-[72px] shrink-0"
                    src="/frens/lili.svg"
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
                      className="absolute top-[-36px] left-1/2 h-[30px] -translate-x-1/2"
                      src="/frens/bittu.svg"
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
                      className="h-[60px] shrink-0"
                      src="/frens/kuzco.svg"
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
              animate={giantAnimate}
              className="absolute right-0 bottom-6"
              transition={giantTransition}
            >
              <img alt="" className="h-28" src="/frens/giant.svg" />
            </motion.div>

            <motion.div
              animate={
                hasCollapsed
                  ? { y: 300, opacity: 0, rotate: 3 }
                  : { y: 0, opacity: 1, rotate: 0 }
              }
              className="absolute right-[120px] bottom-6 left-0 origin-bottom overflow-hidden"
              transition={hasCollapsed ? collapseTransition : { duration: 0 }}
            >
              <div className="mb-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />

              <div className="overflow-hidden">
                <motion.div
                  animate={{ x: -scrollOffset }}
                  className="flex items-stretch gap-1.5"
                  style={{ width: totalBridgeWidth || '100%' }}
                  transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                >
                  <motion.div
                    animate={
                      hasCollapsed
                        ? { y: 20, rotate: -8, opacity: 0 }
                        : { y: 0, rotate: 0, opacity: 1 }
                    }
                    className="w-1 shrink-0 rounded-sm bg-ens-garnet-900/40"
                    transition={
                      hasCollapsed
                        ? { ...collapseTransition, delay: 0 }
                        : { duration: 0 }
                    }
                  />
                  {stepIds.map((id, i) => (
                    <BridgePlank
                      collapseTransition={collapseTransition}
                      hasCollapsed={hasCollapsed}
                      id={id}
                      index={i}
                      key={id}
                      plankWidth={plankWidth}
                      stepDone={i < completedSteps}
                    />
                  ))}
                </motion.div>
              </div>

              <div className="mt-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />
            </motion.div>

            <motion.div
              animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
              className="absolute right-[120px] bottom-[23px] left-0 h-px bg-ens-garnet-900/5"
              transition={hasCollapsed ? { duration: 0.3 } : { duration: 0 }}
            />
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
            <img alt="" className="h-[216px]" src="/frens/together.svg" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
