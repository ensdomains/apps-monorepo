import { match, P } from 'ts-pattern'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'

export const VISIBLE_PLANKS = 6

export type CollapseTransition = {
  readonly duration: number
  readonly ease: readonly [number, number, number, number]
}

export type BridgeLayout = {
  readonly plankWidth: number
  readonly frensX: number
  readonly scrollOffset: number
  readonly totalBridgeWidth: number
  readonly needsScroll: boolean
}

export const computeBridgeLayout = (params: {
  readonly totalSteps: number
  readonly completedSteps: number
  readonly trackWidth: number
  readonly visiblePlanks?: number
}): BridgeLayout => {
  const { totalSteps, completedSteps, trackWidth } = params
  const visiblePlanks = params.visiblePlanks ?? VISIBLE_PLANKS
  const needsScroll = totalSteps > visiblePlanks
  const plankWidth =
    trackWidth > 0 ? trackWidth / Math.min(totalSteps, visiblePlanks) : 0
  const totalBridgeWidth = plankWidth * totalSteps

  if (!needsScroll || trackWidth === 0) {
    const frensX = ((completedSteps + 0.5) / totalSteps) * trackWidth
    return {
      plankWidth,
      frensX,
      scrollOffset: 0,
      totalBridgeWidth,
      needsScroll,
    }
  }

  const midPlank = Math.floor(visiblePlanks / 2)
  const scrollStart = midPlank
  const scrollEnd = totalSteps - (visiblePlanks - midPlank)

  if (completedSteps < scrollStart) {
    return {
      plankWidth,
      frensX: (completedSteps + 0.5) * plankWidth,
      scrollOffset: 0,
      totalBridgeWidth,
      needsScroll,
    }
  }
  if (completedSteps >= scrollEnd) {
    const stepsFromEnd = totalSteps - completedSteps
    return {
      plankWidth,
      frensX: trackWidth - (stepsFromEnd - 0.5) * plankWidth,
      scrollOffset: (scrollEnd - scrollStart) * plankWidth,
      totalBridgeWidth,
      needsScroll,
    }
  }
  return {
    plankWidth,
    frensX: (midPlank + 0.5) * plankWidth,
    scrollOffset: (completedSteps - scrollStart) * plankWidth,
    totalBridgeWidth,
    needsScroll,
  }
}

export type StepDescription =
  | { readonly kind: 'done' }
  | { readonly kind: 'progress'; readonly text: string }
  | { readonly kind: 'preparing' }
  | {
      readonly kind: 'renew-grace'
      readonly label: string
      readonly index: number
      readonly total: number
    }
  | { readonly kind: 'approve-base-registrar' }
  | { readonly kind: 'approve-name-wrapper' }
  | { readonly kind: 'ensure-resolver' }
  | {
      readonly kind: 'migrate-batch'
      readonly index: number
      readonly total: number
      readonly count: number
    }
  | { readonly kind: 'grant-role'; readonly label: string }
  | {
      readonly kind: 'profile-replay-batch'
      readonly index: number
      readonly total: number
    }

export const describeNextStep = (params: {
  readonly done: boolean
  readonly progressDescription?: string
  readonly descriptor: MigrationStepDescriptor | undefined
}): StepDescription =>
  match(params)
    .with({ done: true }, () => ({ kind: 'done' as const }))
    .with(
      { progressDescription: P.string },
      ({ progressDescription }) =>
        ({ kind: 'progress' as const, text: progressDescription }) as const,
    )
    .with({ descriptor: P.nullish }, () => ({ kind: 'preparing' as const }))
    .with({ descriptor: { type: 'renew-grace' } }, ({ descriptor }) => ({
      kind: 'renew-grace' as const,
      label: descriptor.label,
      index: descriptor.index,
      total: descriptor.total,
    }))
    .with({ descriptor: { type: 'approve-base-registrar' } }, () => ({
      kind: 'approve-base-registrar' as const,
    }))
    .with({ descriptor: { type: 'approve-name-wrapper' } }, () => ({
      kind: 'approve-name-wrapper' as const,
    }))
    .with({ descriptor: { type: 'ensure-resolver' } }, () => ({
      kind: 'ensure-resolver' as const,
    }))
    .with({ descriptor: { type: 'migrate-batch' } }, ({ descriptor }) => ({
      kind: 'migrate-batch' as const,
      index: descriptor.index,
      total: descriptor.total,
      count: descriptor.count,
    }))
    .with({ descriptor: { type: 'grant-role' } }, ({ descriptor }) => ({
      kind: 'grant-role' as const,
      label: descriptor.label,
    }))
    .with(
      { descriptor: { type: 'profile-replay-batch' } },
      ({ descriptor }) => ({
        kind: 'profile-replay-batch' as const,
        index: descriptor.index,
        total: descriptor.total,
      }),
    )
    .exhaustive()

export const formatStepDescription = (
  stepDescription: StepDescription,
  t: (strings: TemplateStringsArray, ...values: unknown[]) => string,
): string =>
  match(stepDescription)
    .with({ kind: 'done' }, () => t`Almost there...`)
    .with({ kind: 'progress' }, ({ text }) => text)
    .with({ kind: 'preparing' }, () => t`Getting ready...`)
    .with({ kind: 'renew-grace' }, ({ label, index, total }) =>
      total === 1
        ? `${t`Renewing ${label}.eth`}...`
        : `${t`Renewing ${label}.eth`} (${index + 1}/${total})...`,
    )
    .with(
      { kind: 'approve-base-registrar' },
      () => `${t`Approve in your wallet`}...`,
    )
    .with(
      { kind: 'approve-name-wrapper' },
      () => `${t`Approve in your wallet`}...`,
    )
    .with({ kind: 'ensure-resolver' }, () => `${t`Setting up resolver`}...`)
    .with({ kind: 'migrate-batch' }, ({ index, total, count }) =>
      total === 1
        ? `${t`Upgrading ${count} name(s)`}...`
        : `${t`Upgrading batch ${index + 1} of ${total} (${count} name(s))`}...`,
    )
    .with(
      { kind: 'grant-role' },
      ({ label }) => `${t`Saving manager for ${label}.eth`}...`,
    )
    .with({ kind: 'profile-replay-batch' }, ({ index, total }) =>
      total === 1
        ? `${t`Restoring your records`}...`
        : `${t`Restoring records batch ${index + 1} of ${total}`}...`,
    )
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
  done: boolean,
  completedSteps: number,
  totalSteps: number,
): number => (done ? totalSteps : Math.min(completedSteps + 1, totalSteps))
