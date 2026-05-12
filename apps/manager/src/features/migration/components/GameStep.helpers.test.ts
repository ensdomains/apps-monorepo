import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'
import {
  computeBridgeLayout,
  describeNextStep,
  displayStepOf,
  giantAnimateFor,
  giantModeOf,
  giantTransitionFor,
} from './GameStep.helpers'

describe('computeBridgeLayout', () => {
  it('returns zero-sized layout when trackWidth is 0', () => {
    const r = computeBridgeLayout({
      totalSteps: 3,
      completedSteps: 0,
      trackWidth: 0,
    })
    expect(r.plankWidth).toBe(0)
    expect(r.totalBridgeWidth).toBe(0)
    expect(r.scrollOffset).toBe(0)
    expect(r.needsScroll).toBe(false)
  })

  it('fits within visible planks: centers frens proportionally, no scroll', () => {
    const r = computeBridgeLayout({
      totalSteps: 4,
      completedSteps: 2,
      trackWidth: 400,
      visiblePlanks: 6,
    })
    expect(r.needsScroll).toBe(false)
    expect(r.scrollOffset).toBe(0)
    expect(r.frensX).toBeCloseTo(((2 + 0.5) / 4) * 400)
  })

  it('when overflowing and before scroll window, holds scroll at 0', () => {
    const r = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 1,
      trackWidth: 600,
      visiblePlanks: 6,
    })
    expect(r.needsScroll).toBe(true)
    expect(r.scrollOffset).toBe(0)
    expect(r.frensX).toBeCloseTo((1 + 0.5) * (600 / 6))
  })

  it('when overflowing and in scroll window, pins frens at mid plank', () => {
    const r = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 4,
      trackWidth: 600,
      visiblePlanks: 6,
    })
    const plank = 600 / 6
    const midPlank = 3
    expect(r.frensX).toBeCloseTo((midPlank + 0.5) * plank)
    expect(r.scrollOffset).toBeCloseTo((4 - midPlank) * plank)
  })

  it('when at scroll end, anchors frens from the right edge', () => {
    const r = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 8,
      trackWidth: 600,
      visiblePlanks: 6,
    })
    const plank = 600 / 6
    const stepsFromEnd = 10 - 8
    expect(r.frensX).toBeCloseTo(600 - (stepsFromEnd - 0.5) * plank)
  })
})

describe('describeNextStep', () => {
  const descriptor = (d: MigrationStepDescriptor): MigrationStepDescriptor => d

  it.each([
    ['done flag wins', { done: true, descriptor: undefined }, { kind: 'done' }],
    [
      'progressDescription wins when not done',
      {
        done: false,
        progressDescription: 'Approving…',
        descriptor: undefined,
      },
      { kind: 'progress', text: 'Approving…' },
    ],
    [
      'no descriptor → preparing',
      { done: false, descriptor: undefined },
      { kind: 'preparing' },
    ],
    [
      'approve-base-registrar descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'approve-base-registrar' }),
      },
      { kind: 'approve-base-registrar' },
    ],
    [
      'approve-name-wrapper descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'approve-name-wrapper' }),
      },
      { kind: 'approve-name-wrapper' },
    ],
    [
      'ensure-resolver descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'ensure-resolver' }),
      },
      { kind: 'ensure-resolver' },
    ],
    [
      'migrate-all descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'migrate-all', count: 5 }),
      },
      { kind: 'migrate-all', count: 5 },
    ],
    [
      'grant-role descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'grant-role', label: 'myname' }),
      },
      { kind: 'grant-role', label: 'myname' },
    ],
    [
      'profile-replay descriptor',
      {
        done: false,
        descriptor: descriptor({ type: 'profile-replay', label: 'myname' }),
      },
      { kind: 'profile-replay', label: 'myname' },
    ],
  ] as const)('%s', (_, params, expected) => {
    expect(describeNextStep(params)).toEqual(expected)
  })
})

describe('giantModeOf / giantAnimateFor / giantTransitionFor', () => {
  it.each([
    [{ hasCollapsed: true, isExcited: false }, 'collapsed'],
    [{ hasCollapsed: true, isExcited: true }, 'collapsed'],
    [{ hasCollapsed: false, isExcited: true }, 'excited'],
    [{ hasCollapsed: false, isExcited: false }, 'idle'],
  ] as const)('giantModeOf(%j) → %s', (params, expected) => {
    expect(giantModeOf(params)).toBe(expected)
  })

  it('variant builders return the expected shape per mode', () => {
    expect(giantAnimateFor('collapsed')).toHaveProperty('opacity', 0)
    expect(giantAnimateFor('excited')).toHaveProperty('scale')
    expect(giantTransitionFor('excited')).toHaveProperty(
      'repeat',
      Number.POSITIVE_INFINITY,
    )
    expect(giantTransitionFor('collapsed')).toHaveProperty('delay', 0.1)
  })
})

describe('displayStepOf', () => {
  it.each([
    [true, 5, 10, 10],
    [false, 0, 10, 1],
    [false, 9, 10, 10],
    [false, 15, 10, 10],
  ])('done=%s completed=%i total=%i → %i', (done, c, total, expected) => {
    expect(displayStepOf(done, c, total)).toBe(expected)
  })
})
