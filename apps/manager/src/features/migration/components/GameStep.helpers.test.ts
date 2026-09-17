import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'
import {
  bridgeStepsOf,
  computeBridgeLayout,
  describeNextStep,
  displayStepOf,
  giantAnimateFor,
  giantModeOf,
  giantTransitionFor,
  PLANK_PARTY_PADDING,
} from './GameStep.helpers'

describe('bridgeStepsOf', () => {
  it('occupies the active step before wallet confirmation and advances with the next step', () => {
    expect(bridgeStepsOf(0, 2, false)).toBe(0)
    expect(bridgeStepsOf(0, 2, true)).toBe(1)
    expect(bridgeStepsOf(1, 2, true)).toBe(2)
    expect(bridgeStepsOf(2, 2, true)).toBe(2)
  })

  it('keeps recovery progress on the last completed plank', () => {
    expect(bridgeStepsOf(1, 2, false)).toBe(1)
  })

  it('never advances beyond the final plank', () => {
    expect(bridgeStepsOf(2, 2, true)).toBe(2)
  })
})

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
      partyScale: 1,
      frensX: 0,
      scrollOffset: 0,
      totalBridgeWidth: 0,
      needsScroll: false,
    })
  })

  it('centers the party on the last completed plank', () => {
    const layout = computeBridgeLayout({
      totalSteps: 4,
      completedSteps: 2,
      trackWidth: 400,
    })
    expect(layout.plankWidth).toBe(200)
    expect(layout.frensX).toBe(282)
    expect(layout.scrollOffset).toBe(100)
    expect(layout.needsScroll).toBe(true)
  })

  it('starts scrolling only after the occupied plank center reaches the middle', () => {
    const first = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 1,
      trackWidth: 600,
    })
    expect(first.frensX).toBe(182)
    expect(first.scrollOffset).toBe(0)
    const middle = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 4,
      trackWidth: 600,
    })
    expect(middle.frensX).toBe(382)
    expect(middle.scrollOffset).toBe(400)
  })

  it('stops scrolling at the end with the party centered on the final plank', () => {
    const layout = computeBridgeLayout({
      totalSteps: 10,
      completedSteps: 10,
      trackWidth: 600,
    })
    expect(layout.frensX).toBe(582)
    expect(layout.scrollOffset).toBe(1400)
  })

  it.each([
    64, 137, 400, 600,
  ])('keeps the entire party inside one visible plank at a %ipx bridge width', (trackWidth) => {
    for (const partyWidth of [112, 164]) {
      for (const totalSteps of [1, 4, 6, 10, 100]) {
        for (
          let completedSteps = 1;
          completedSteps <= totalSteps;
          completedSteps += 1
        ) {
          const layout = computeBridgeLayout({
            totalSteps,
            completedSteps,
            trackWidth,
            partyWidth,
          })
          const center = layout.frensX - partyWidth / 2
          const halfParty = (partyWidth * layout.partyScale) / 2
          const plankStart =
            (completedSteps - 1) * layout.plankWidth - layout.scrollOffset
          const plankEnd = plankStart + layout.plankWidth
          expect(center - halfParty).toBeGreaterThanOrEqual(
            plankStart + PLANK_PARTY_PADDING / 2 - 0.000001,
          )
          expect(center + halfParty).toBeLessThanOrEqual(
            plankEnd - PLANK_PARTY_PADDING / 2 + 0.000001,
          )
          expect(plankStart).toBeGreaterThanOrEqual(-0.000001)
          expect(plankEnd).toBeLessThanOrEqual(trackWidth + 0.000001)
        }
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
    ).toBe(382)
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
