import { match, P } from 'ts-pattern'
import type { MigrationWalletRequestDescriptor } from '@/features/migration/service/buildStepDescriptors'
import type { MigrationApprovalId } from '@/features/migration/service/migrationApprovals'

export const PLANK_PARTY_PADDING = 24
export const TREADMILL_THRESHOLD = 5

const waitingBounces = {
  peanut: { height: 12, duration: 0.5, delay: 0.1, repeatDelay: 0.17 },
  lili: { height: 16, duration: 0.6, delay: 0.27, repeatDelay: 0.09 },
  bittu: { height: 20, duration: 0.8, delay: 0.05, repeatDelay: 0.12 },
  kuzco: { height: 10, duration: 0.55, delay: 0.43, repeatDelay: 0.23 },
} as const

export const waitingBounceFor = (
  character: keyof typeof waitingBounces,
  isWaiting: boolean,
) => {
  const { height, ...timing } = waitingBounces[character]
  return {
    animate: { y: isWaiting ? [0, -height, 0] : 0 },
    initial: { y: 0 },
    transition: isWaiting
      ? {
          ...timing,
          ease: 'easeInOut' as const,
          repeat: Number.POSITIVE_INFINITY,
        }
      : { duration: 0.15 },
  }
}

export const occupiedPlanksOf = (
  completedSteps: number,
  totalSteps: number,
  isAwaitingConfirmation: boolean,
): number =>
  Math.min(
    totalSteps,
    Math.max(0, completedSteps) + (isAwaitingConfirmation ? 1 : 0),
  )

export type BridgeLayout = {
  readonly plankWidth: number
  readonly partyScale: number
  readonly frensX: number
  readonly bridgeWidth: number
  readonly scrollX: number
}

export const computeBridgeLayout = (params: {
  readonly totalSteps: number
  readonly completedSteps: number
  readonly trackWidth: number
  readonly partyWidth?: number
}): BridgeLayout => {
  const totalSteps = Math.max(0, Math.floor(params.totalSteps))
  const completedSteps = Math.min(
    Math.max(0, Math.floor(params.completedSteps)),
    totalSteps,
  )
  const trackWidth = Math.max(0, params.trackWidth)
  const partyWidth = Math.max(1, params.partyWidth ?? 164)
  const isTreadmill = totalSteps > TREADMILL_THRESHOLD
  const plankWidth =
    totalSteps > 0
      ? isTreadmill
        ? Math.min(
            trackWidth,
            Math.max(
              trackWidth / Math.min(totalSteps, 3),
              partyWidth + PLANK_PARTY_PADDING,
            ),
          )
        : trackWidth / totalSteps
      : 0
  const bridgeWidth = plankWidth * totalSteps
  const scrollX = isTreadmill
    ? Math.min(
        Math.max(0, (completedSteps - 0.5) * plankWidth - trackWidth / 2),
        Math.max(0, bridgeWidth - trackWidth),
      )
    : 0
  const padding = Math.min(PLANK_PARTY_PADDING, plankWidth / 4)
  const partyScale =
    completedSteps > 0 && plankWidth > 0
      ? Math.min(1, (plankWidth - padding) / partyWidth)
      : 1

  return {
    plankWidth,
    partyScale,
    bridgeWidth,
    scrollX,
    // Party movement follows completed stages; submission only reveals a plank.
    frensX:
      completedSteps > 0 && plankWidth > 0
        ? partyWidth / 2 + (completedSteps - 0.5) * plankWidth
        : 0,
  }
}

export type StepDescription =
  | { readonly kind: 'progress'; readonly text: string }
  | { readonly kind: 'preparing' }
  | {
      readonly kind: 'renewal-approval'
      readonly isAwaitingConfirmation: boolean
    }
  | { readonly kind: 'renew-grace'; readonly count: number }
  | { readonly kind: 'deploy-hca' }
  | { readonly kind: 'approval'; readonly approvalId: MigrationApprovalId }
  | {
      readonly kind: 'atomic-batch'
      readonly index: number
      readonly total: number
      readonly count: number
    }
  | { readonly kind: 'cleanup' }

export const describeNextStep = (params: {
  readonly progressDescription?: string
  readonly descriptor: MigrationWalletRequestDescriptor | undefined
  readonly isAwaitingConfirmation?: boolean
}): StepDescription =>
  match(params)
    .with(
      { progressDescription: P.string.minLength(1) },
      ({ progressDescription }) =>
        ({ kind: 'progress' as const, text: progressDescription }) as const,
    )
    .with({ descriptor: P.nullish }, () => ({ kind: 'preparing' as const }))
    .with(
      { descriptor: { type: 'renewal-approval' } },
      ({ isAwaitingConfirmation }) => ({
        kind: 'renewal-approval' as const,
        isAwaitingConfirmation: isAwaitingConfirmation === true,
      }),
    )
    .with({ descriptor: { type: 'renew-grace' } }, ({ descriptor }) => ({
      kind: 'renew-grace' as const,
      count: descriptor.count,
    }))
    .with({ descriptor: { type: 'deploy-hca' } }, () => ({
      kind: 'deploy-hca' as const,
    }))
    .with({ descriptor: { type: 'approval' } }, ({ descriptor }) => ({
      kind: 'approval' as const,
      approvalId: descriptor.approvalId,
    }))
    .with({ descriptor: { type: 'atomic-batch' } }, ({ descriptor }) => ({
      kind: 'atomic-batch' as const,
      index: descriptor.index,
      total: descriptor.total,
      count: descriptor.count,
    }))
    .with({ descriptor: { type: 'cleanup' } }, () => ({
      kind: 'cleanup' as const,
    }))
    .exhaustive()

export type GiantMode = 'collapsed' | 'excited' | 'idle'

export const giantModeOf = (params: {
  readonly hasCollapsed: boolean
  readonly isExcited: boolean
}): GiantMode =>
  match(params)
    .with({ hasCollapsed: true }, () => 'collapsed' as const)
    .with({ isExcited: true }, () => 'excited' as const)
    .otherwise(() => 'idle' as const)

export const giantAnimateFor = (mode: GiantMode) =>
  match(mode)
    .with('collapsed', () => ({ y: 300, rotate: -10, opacity: 0 }))
    .with('excited', () => ({ y: [0, -14, 0], scale: [1, 1.05, 1] }))
    .with('idle', () => ({ y: [0, -6, 0] }))
    .exhaustive()

export const giantTransitionFor = (mode: GiantMode) =>
  match(mode)
    .with('collapsed', () => ({
      duration: 0.9,
      ease: [0.36, 0, 0.66, -0.56] as const,
      delay: 0.1,
    }))
    .with('excited', () => ({
      duration: 0.7,
      ease: 'easeInOut' as const,
      repeat: Number.POSITIVE_INFINITY,
    }))
    .with('idle', () => ({
      duration: 4,
      ease: 'easeInOut' as const,
      repeat: Number.POSITIVE_INFINITY,
    }))
    .exhaustive()

export const displayStepOf = (
  completedSteps: number,
  totalSteps: number,
): number => Math.min(completedSteps + 1, totalSteps)
