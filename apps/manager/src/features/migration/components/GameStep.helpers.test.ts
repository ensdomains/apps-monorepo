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
  it.each([
    0, 1, 4, 10, 100,
  ])('keeps the party on shore before any of %i steps completes', (totalSteps) => {
    const layout = computeBridgeLayout({
      totalSteps,
      completedSteps: 0,
      trackWidth: 600,
    })
    expect(layout.frensX).toBe(0)
    expect(layout.scrollOffset).toBe(0)
    expect(Number.isFinite(layout.plankWidth)).toBe(true)
  })

  it('returns a finite zero layout while the bridge has not been measured', () => {
    expect(
      computeBridgeLayout({ totalSteps: 3, completedSteps: 0, trackWidth: 0 }),
    ).toEqual({
      plankWidth: 0,
      frensX: 0,
      scrollOffset: 0,
      totalBridgeWidth: 0,
      needsScroll: false,
    })
  })

  it('advances only to the completed edge, never onto the next empty plank', () => {
    const layout = computeBridgeLayout({
      totalSteps: 4,
      completedSteps: 2,
      trackWidth: 400,
    })
    expect(layout.frensX).toBe(200)
    expect(layout.scrollOffset).toBe(0)
    expect(layout.needsScroll).toBe(false)
  })

  it('starts scrolling only after the completed edge reaches the middle', () => {
    const first = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 1,
      trackWidth: 600,
    })
    expect(first.frensX).toBe(100)
    expect(first.scrollOffset).toBe(0)
    const middle = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 4,
      trackWidth: 600,
    })
    expect(middle.frensX).toBe(300)
    expect(middle.scrollOffset).toBe(100)
  })

  it('stops scrolling at the end and lets the party reach the far shore', () => {
    const layout = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 10,
      trackWidth: 600,
    })
    expect(layout.frensX).toBe(600)
    expect(layout.scrollOffset).toBe(400)
  })

  it.each([
    64, 137, 400, 600,
  ])('keeps the party supported for every step at a %ipx bridge width', (trackWidth) => {
    for (const totalSteps of [1, 4, 6, 10, 100]) {
      for (
        let completedSteps = 0;
        completedSteps <= totalSteps;
        completedSteps += 1
      ) {
        const layout = computeBridgeLayout({
          totalSteps,
          completedSteps,
          trackWidth,
        })
        expect(layout.frensX).toBeGreaterThanOrEqual(0)
        expect(layout.frensX).toBeLessThanOrEqual(trackWidth + 0.000001)
        expect(layout.frensX + layout.scrollOffset).toBeCloseTo(
          completedSteps * layout.plankWidth,
        )
      }
    }
  })

  it('clamps stale out-of-range progress to the bridge boundaries', () => {
    expect(
      computeBridgeLayout({
        totalSteps: 4,
        completedSteps: -1,
        trackWidth: 400,
      }).frensX,
    ).toBe(0)
    expect(
      computeBridgeLayout({ totalSteps: 4, completedSteps: 8, trackWidth: 400 })
        .frensX,
    ).toBe(400)
  })
})

describe('describeNextStep', () => {
  const descriptor = (d: MigrationStepDescriptor): MigrationStepDescriptor => d

  it.each([
    [
      'progressDescription wins',
      {
        progressDescription: 'Approving…',
        descriptor: undefined,
      },
      { kind: 'progress', text: 'Approving…' },
    ],
    [
      'no descriptor → preparing',
      { descriptor: undefined },
      { kind: 'preparing' },
    ],
    [
      'deploy-hca descriptor',
      {
        descriptor: descriptor({ type: 'deploy-hca' }),
      },
      { kind: 'deploy-hca' },
    ],
    [
      'approval descriptor',
      {
        descriptor: descriptor({
          type: 'approval',
          approvalId: 'base-registrar:hca',
        }),
      },
      { kind: 'approval', approvalId: 'base-registrar:hca' },
    ],
    [
      'per-token approval descriptor',
      {
        descriptor: descriptor({
          type: 'approval',
          approvalId: 'base-registrar:hca-token',
        }),
      },
      { kind: 'approval', approvalId: 'base-registrar:hca-token' },
    ],
    [
      'atomic-batch descriptor',
      {
        descriptor: descriptor({
          type: 'atomic-batch',
          index: 0,
          total: 1,
          count: 5,
          migrateCount: 3,
          copyCount: 2,
        }),
      },
      { kind: 'atomic-batch', index: 0, total: 1, count: 5 },
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
    [0, 10, 1],
    [9, 10, 10],
    [15, 10, 10],
  ])('completed=%i total=%i → %i', (completed, total, expected) => {
    expect(displayStepOf(completed, total)).toBe(expected)
  })
})
