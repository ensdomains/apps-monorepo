import { match, P } from 'ts-pattern'
import type { MigrationApprovalId } from '@/features/migration/service/migrationApprovals'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'

export const VISIBLE_PLANKS = 6
export const PLANK_PARTY_PADDING = 24

export const bridgeStepsOf = (
  completedSteps: number,
  totalSteps: number,
  hasActiveStep: boolean,
): number => Math.min(completedSteps + (hasActiveStep ? 1 : 0), totalSteps)

export type BridgeLayout = {
  readonly plankWidth: number
  readonly partyScale: number
  readonly frensX: number
  readonly scrollOffset: number
  readonly totalBridgeWidth: number
  readonly needsScroll: boolean
}

export const computeBridgeLayout = (params: {
  readonly totalSteps: number
  readonly completedSteps: number
  readonly trackWidth: number
  readonly partyWidth?: number
  readonly visiblePlanks?: number
}): BridgeLayout => {
  const totalSteps = Math.max(0, Math.floor(params.totalSteps))
  const completedSteps = Math.min(
    Math.max(0, Math.floor(params.completedSteps)),
    totalSteps,
  )
  const trackWidth = Math.max(0, params.trackWidth)
  const partyWidth = Math.max(1, params.partyWidth ?? 164)
  const minimumPlankWidth = partyWidth + PLANK_PARTY_PADDING
  const visiblePlanks = Math.max(
    1,
    Math.min(
      params.visiblePlanks ?? VISIBLE_PLANKS,
      Math.floor(trackWidth / minimumPlankWidth),
    ),
  )
  const needsScroll = trackWidth > 0 && totalSteps > visiblePlanks
  const plankWidth =
    totalSteps > 0 ? trackWidth / Math.min(totalSteps, visiblePlanks) : 0
  const totalBridgeWidth = plankWidth * totalSteps
  // Each active step gives the whole party one plank. On narrow screens,
  // scale the party to fit inside the plank, leaving room around its edges.
  const partyScale =
    completedSteps > 0 && plankWidth > 0
      ? Math.min(1, Math.max(0, plankWidth - PLANK_PARTY_PADDING) / partyWidth)
      : 1
  const plankCenter = Math.max(0, completedSteps - 0.5) * plankWidth
  const scrollOffset = Math.min(
    Math.max(0, plankCenter - trackWidth / 2),
    Math.max(0, totalBridgeWidth - trackWidth),
  )
  return {
    plankWidth,
    partyScale,
    // The starting shore and party wrapper have the same width.
    frensX:
      completedSteps > 0 && plankWidth > 0
        ? partyWidth / 2 + plankCenter - scrollOffset
        : 0,
    scrollOffset,
    totalBridgeWidth,
    needsScroll,
  }
}

export type StepDescription =
  | { readonly kind: 'progress'; readonly text: string }
  | { readonly kind: 'preparing' }
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
  readonly descriptor: MigrationStepDescriptor | undefined
}): StepDescription =>
  match(params)
    .with(
      { progressDescription: P.string },
      ({ progressDescription }) =>
        ({ kind: 'progress' as const, text: progressDescription }) as const,
    )
    .with({ descriptor: P.nullish }, () => ({ kind: 'preparing' as const }))
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
