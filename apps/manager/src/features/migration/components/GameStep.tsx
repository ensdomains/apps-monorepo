import { plural } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from 'motion/react'
import { match } from 'ts-pattern'
import { useElementWidth } from '@/features/migration/hooks/useElementWidth'
import type {
  MigrationProgress,
  MigrationStepDescriptor,
} from '@/features/migration/service/migrationService'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrateSubstep,
  useMigrationProgress,
  useMigrationSelectedNames,
  useMigrationStepDescriptors,
} from '@/features/migration/state/migrationUi.selectors'
import { cn } from '@/lib/utils'
import {
  computeBridgeLayout,
  describeNextStep,
  displayStepOf,
  giantAnimateFor,
  giantModeOf,
  giantTransitionFor,
  VISIBLE_PLANKS,
} from './GameStep.helpers'

const collapseTransition = {
  duration: 0.8,
  ease: [0.55, 0, 1, 0.45] as const,
}

type BridgePlankProps = {
  readonly completed: boolean
  readonly hasCollapsed: boolean
  readonly id: string
  readonly index: number
  readonly width: number
}

const BridgePlank = ({
  completed,
  hasCollapsed,
  id,
  index,
  width,
}: BridgePlankProps) => {
  const reduceMotion = useReducedMotion()
  const staggerIndex = index % VISIBLE_PLANKS
  const alternatingRotation = index % 2 === 0

  return (
    <motion.div
      animate={
        hasCollapsed
          ? {
              y: 40 + staggerIndex * 15,
              rotate: alternatingRotation ? 12 : -10,
              opacity: 0,
            }
          : { y: 0, rotate: 0, opacity: 1 }
      }
      className="flex shrink-0 items-stretch"
      key={id}
      style={{ width }}
      transition={
        hasCollapsed
          ? {
              ...collapseTransition,
              delay: 0.05 + staggerIndex * 0.06,
            }
          : { duration: 0 }
      }
    >
      <div className="relative h-6 flex-1 overflow-hidden rounded-[3px] border-ens-garnet-900/8 border-x-[3px] bg-ens-garnet-900/4">
        <motion.div
          animate={{ scaleX: completed ? 1 : 0, opacity: completed ? 1 : 0 }}
          className="absolute inset-0 origin-left bg-ens-garnet-900/45 shadow-[inset_0_-3px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]"
          initial={false}
          transition={{
            duration: reduceMotion ? 0 : 0.3,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      </div>
      <motion.div
        animate={
          hasCollapsed
            ? {
                y: 30 + staggerIndex * 10,
                rotate: alternatingRotation ? -15 : 8,
                opacity: 0,
              }
            : { y: 0, rotate: 0, opacity: 1 }
        }
        className={cn(
          'ml-1.5 w-1 shrink-0 rounded-sm',
          completed ? 'bg-ens-garnet-900/40' : 'bg-ens-garnet-900/10',
        )}
        transition={
          hasCollapsed
            ? {
                ...collapseTransition,
                delay: 0.08 + staggerIndex * 0.06,
              }
            : { duration: 0 }
        }
      />
    </motion.div>
  )
}

const useStepDescriptionText = (
  progressDescription: string | undefined,
  descriptor: MigrationStepDescriptor | undefined,
): string => {
  const { t } = useLingui()
  const stepDescription = describeNextStep({
    progressDescription,
    descriptor,
  })

  return match(stepDescription)
    .with({ kind: 'progress' }, ({ text }) => text)
    .with({ kind: 'preparing' }, () => t`Getting ready...`)
    .with({ kind: 'deploy-hca' }, () => `${t`Setting things up`}...`)
    .with({ kind: 'approval' }, ({ approvalId }) =>
      match(approvalId)
        .with(
          'base-registrar:hca-token',
          () => `${t`Approve this name in your wallet`}...`,
        )
        .with(
          'base-registrar:hca',
          'name-wrapper:hca',
          () => `${t`Approve the temporary account in your wallet`}...`,
        )
        .with(
          'eth-registry:hca',
          () => `${t`Approve restoring your managers in your wallet`}...`,
        )
        .exhaustive(),
    )
    .with({ kind: 'atomic-batch' }, ({ index, total, count }) =>
      total === 1
        ? plural(count, {
            one: 'Upgrading # name...',
            other: 'Upgrading # names...',
          })
        : plural(count, {
            one: `Upgrading batch ${index + 1} of ${total} (# name)...`,
            other: `Upgrading batch ${index + 1} of ${total} (# names)...`,
          }),
    )
    .with({ kind: 'cleanup' }, () => `${t`Removing temporary access`}...`)
    .exhaustive()
}

const FrenParty = ({
  frensX,
  hasCollapsed,
  isExcited,
}: {
  readonly frensX: number
  readonly hasCollapsed: boolean
  readonly isExcited: boolean
}) => (
  <motion.div
    animate={
      hasCollapsed
        ? { x: frensX, y: 300, rotate: 15, opacity: 0 }
        : { x: frensX }
    }
    className="absolute bottom-0 left-0 flex w-28 justify-center sm:w-41"
    initial={false}
    transition={
      hasCollapsed
        ? { duration: 1, ease: [0.36, 0, 0.66, -0.56] }
        : { duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }
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
        className="h-9 shrink-0 sm:h-[54px]"
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
        className="h-12 shrink-0 sm:h-[72px]"
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
          className="absolute -top-6 left-1/2 h-5 -translate-x-1/2 sm:-top-9 sm:h-[30px]"
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
          className="h-10 shrink-0 sm:h-[60px]"
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
)

export const GameStep = () => {
  const { uiActor } = useMigrationUiContext()
  const substep = useMigrateSubstep(uiActor)
  const progress = useMigrationProgress(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const stepDescriptors = useMigrationStepDescriptors(uiActor)
  return (
    <GameStepView
      hasCollapsed={substep === 'failing'}
      progress={progress}
      selectedNameCount={selectedNames.length}
      stepDescriptors={stepDescriptors}
    />
  )
}

export const GameStepView = ({
  hasCollapsed,
  progress,
  selectedNameCount,
  stepDescriptors,
}: {
  readonly hasCollapsed: boolean
  readonly progress: MigrationProgress | undefined
  readonly selectedNameCount: number
  readonly stepDescriptors: readonly MigrationStepDescriptor[]
}) => {
  const { t } = useLingui()
  const { ref: trackRef, width: trackWidth } = useElementWidth()
  const totalSteps = Math.max(progress?.totalSteps ?? stepDescriptors.length, 1)
  const completedSteps = Math.min(
    Math.max(progress?.currentStep ?? 0, 0),
    totalSteps,
  )
  const displayStep = displayStepOf(completedSteps, totalSteps)
  const { plankWidth, frensX, scrollOffset, totalBridgeWidth } =
    computeBridgeLayout({ totalSteps, completedSteps, trackWidth })

  const isExcited = !!progress?.txHash && !hasCollapsed

  const nextDescriptor = stepDescriptors[completedSteps] as
    | MigrationStepDescriptor
    | undefined

  const descriptionText = useStepDescriptionText(
    progress?.description,
    nextDescriptor,
  )

  const stepIds = Array.from({ length: totalSteps }, (_, i) => `step-${i}`)

  const giantMode = giantModeOf({ hasCollapsed, isExcited })
  const giantAnimate = giantAnimateFor(giantMode)
  const giantTransition = giantTransitionFor(giantMode)

  return (
    <MotionConfig reducedMotion="user">
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-5 md:px-8">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <motion.div
            animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
            className="flex min-h-11 shrink-0 items-center"
            transition={{ duration: 0.3 }}
          >
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Plural
                one="Upgrading your name..."
                other="Upgrading your names..."
                value={selectedNameCount}
              />
            </p>
          </motion.div>

          <motion.div
            animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
            className="flex min-h-6 shrink-0 flex-col items-center"
            transition={{ duration: 0.3 }}
          >
            {progress?.isRecovering && (
              <p className="mb-1 text-center text-ens-garnet-500 text-sm">
                <Trans>Picking up where you left off</Trans>
              </p>
            )}
            <AnimatePresence mode="popLayout">
              <motion.span
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="max-w-full text-center font-semi-mono text-ens-garnet-500 text-xs uppercase tracking-[0.12px]"
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                key={descriptionText}
                transition={{ duration: 0.3 }}
              >
                {descriptionText}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <div className="mt-3 flex h-9 w-full max-w-64 shrink-0 flex-col items-center gap-2">
            <span className="font-semi-mono text-[10px] text-ens-garnet-500 uppercase tabular-nums tracking-[0.12px]">
              <Trans>
                Step {displayStep} of {totalSteps}
              </Trans>
            </span>
            <div
              aria-label={t`Upgrade progress`}
              aria-valuemax={totalSteps}
              aria-valuemin={0}
              aria-valuenow={completedSteps}
              className="h-1.5 w-full overflow-hidden rounded-full bg-ens-garnet-900/10"
              role="progressbar"
            >
              <div
                className="h-full origin-left rounded-full bg-ens-garnet-500 transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${completedSteps / totalSteps})` }}
              />
            </div>
          </div>

          <div className="relative mt-4 h-[360px] w-full max-w-[1040px] shrink-0">
            <div className="absolute inset-0">
              <div className="absolute right-[104px] bottom-14 left-0 z-10 sm:right-[120px]">
                <FrenParty
                  frensX={frensX}
                  hasCollapsed={hasCollapsed}
                  isExcited={isExcited}
                />
              </div>

              <motion.div
                animate={giantAnimate}
                className="absolute right-0 bottom-6"
                transition={giantTransition}
              >
                <img alt="" className="h-20 sm:h-28" src="/frens/giant.svg" />
              </motion.div>

              <div
                aria-hidden
                className="absolute bottom-6 left-0 h-8 w-28 rounded-l border-ens-garnet-900/30 border-y-2 bg-ens-garnet-900/30 sm:w-41"
              />
              <motion.div
                animate={
                  hasCollapsed
                    ? { y: 300, opacity: 0, rotate: 3 }
                    : { y: 0, opacity: 1, rotate: 0 }
                }
                className="absolute right-[104px] bottom-6 left-28 origin-bottom overflow-hidden sm:right-[120px] sm:left-41"
                ref={trackRef}
                transition={hasCollapsed ? collapseTransition : { duration: 0 }}
              >
                <div className="mb-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />

                <div className="overflow-hidden">
                  <motion.div
                    animate={{ x: -scrollOffset }}
                    className="flex items-stretch gap-1.5"
                    style={{ width: totalBridgeWidth || '100%' }}
                    transition={{
                      duration: 0.45,
                      delay: 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    }}
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
                    {stepIds.map((id, index) => (
                      <BridgePlank
                        completed={index < completedSteps}
                        hasCollapsed={hasCollapsed}
                        id={id}
                        index={index}
                        key={id}
                        width={Math.max(plankWidth - 6, 0)}
                      />
                    ))}
                  </motion.div>
                </div>

                <div className="mt-[2px] h-[2px] rounded-full bg-ens-garnet-900/30" />
              </motion.div>

              <motion.div
                animate={hasCollapsed ? { opacity: 0 } : { opacity: 1 }}
                className="absolute right-[104px] bottom-[23px] left-28 h-px bg-ens-garnet-900/5 sm:right-[120px] sm:left-41"
                transition={hasCollapsed ? { duration: 0.3 } : { duration: 0 }}
              />
            </div>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
