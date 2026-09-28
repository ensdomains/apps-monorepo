import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from '@/features/migration/service/migrationService'
import {
  computeBridgeLayout,
  describeNextStep,
  displayStepOf,
  occupiedPlanksOf,
} from './GameStep.helpers'

describe('visible plank progression', () => {
  it('reveals a plank on wallet submission, before the receipt confirms', () => {
    expect(occupiedPlanksOf(0, 4, false)).toBe(0)
    expect(occupiedPlanksOf(0, 4, true)).toBe(1)
  })

  it('keeps the plank visible on receipt confirmation and reveals the next on submission', () => {
    expect(occupiedPlanksOf(0, 4, true)).toBe(occupiedPlanksOf(1, 4, false))
    expect(occupiedPlanksOf(1, 4, true)).toBe(2)
  })

  it('never reveals a plank past the final stage', () => {
    expect(occupiedPlanksOf(3, 4, true)).toBe(4)
    expect(occupiedPlanksOf(4, 4, false)).toBe(4)
    expect(occupiedPlanksOf(4, 4, true)).toBe(4)
  })
})

describe('computeBridgeLayout', () => {
  it.each([
    0, 1, 4, 10, 100,
  ])('keeps the party outside before any of %i transactions succeeds', (totalSteps) => {
    const layout = computeBridgeLayout({
      totalSteps,
      completedSteps: 0,
      trackWidth: 600,
    })
    expect(layout.frensX).toBe(0)
    expect(layout.partyScale).toBe(1)
    expect(Number.isFinite(layout.plankWidth)).toBe(true)
  })

  it('returns a finite layout before the bridge is measured', () => {
    expect(
      computeBridgeLayout({ totalSteps: 3, completedSteps: 0, trackWidth: 0 }),
    ).toEqual({
      plankWidth: 0,
      partyScale: 1,
      frensX: 0,
      bridgeWidth: 0,
      scrollX: 0,
    })
  })

  it.each([
    1, 4, 6, 10, 100,
  ])('provides exactly %i equal transaction planks with the expected bridge width', (totalSteps) => {
    const layout = computeBridgeLayout({
      totalSteps,
      completedSteps: 0,
      trackWidth: 600,
    })
    expect(layout.bridgeWidth).toBeCloseTo(layout.plankWidth * totalSteps)
    if (totalSteps <= 5) expect(layout.bridgeWidth).toBe(600)
    else expect(layout.plankWidth).toBeGreaterThanOrEqual(188)
  })

  it('moves one plank for each successful transaction', () => {
    const positions = [0, 1, 2, 3, 4].map((completedSteps) =>
      computeBridgeLayout({ totalSteps: 4, completedSteps, trackWidth: 400 }),
    )
    expect(positions.map(({ frensX }) => frensX)).toEqual([
      0, 132, 232, 332, 432,
    ])
    expect(positions.every(({ plankWidth }) => plankWidth === 100)).toBe(true)
  })

  it.each([
    64, 137, 400, 600,
  ])('keeps the entire party inside its completed plank at %ipx', (trackWidth) => {
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
          expect(center - halfParty).toBeGreaterThanOrEqual(
            (completedSteps - 1) * layout.plankWidth - 0.000001,
          )
          expect(center + halfParty).toBeLessThanOrEqual(
            completedSteps * layout.plankWidth + 0.000001,
          )
          expect(layout.partyScale).toBeGreaterThan(0)
          expect(layout.partyScale).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('scrolls long bridges while keeping the occupied plank visible', () => {
    const layouts = Array.from({ length: 11 }, (_, completedSteps) =>
      computeBridgeLayout({ totalSteps: 10, completedSteps, trackWidth: 600 }),
    )
    expect(layouts[0]?.scrollX).toBe(0)
    expect(layouts[10]?.scrollX).toBe(1400)
    for (const [index, layout] of layouts.entries()) {
      expect(layout.partyScale).toBe(1)
      if (index === 0) continue
      const left = (index - 1) * layout.plankWidth - layout.scrollX
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + layout.plankWidth).toBeLessThanOrEqual(600)
      expect(layout.scrollX).toBeGreaterThanOrEqual(
        layouts[index - 1]?.scrollX ?? 0,
      )
    }
  })

  it.each([
    1, 2, 3, 4, 5,
  ])('keeps all %i planks stationary through completion', (totalSteps) => {
    for (
      let completedSteps = 0;
      completedSteps <= totalSteps;
      completedSteps += 1
    ) {
      const layout = computeBridgeLayout({
        totalSteps,
        completedSteps,
        trackWidth: 600,
      })
      expect(layout.scrollX).toBe(0)
      expect(layout.bridgeWidth).toBe(600)
    }
  })

  it('starts the treadmill above five transactions', () => {
    const layout = computeBridgeLayout({
      totalSteps: 6,
      completedSteps: 3,
      trackWidth: 600,
    })
    expect(layout.scrollX).toBeGreaterThan(0)
    expect(layout.bridgeWidth).toBeGreaterThan(600)
  })

  it('clamps stale progress to the first and last positions', () => {
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
    ).toBe(432)
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
      'empty progress description uses the renewal descriptor',
      {
        progressDescription: '',
        descriptor: descriptor({ type: 'renew-grace', count: 3 }),
      },
      { kind: 'renew-grace', count: 3 },
    ],
    [
      'empty progress description without a descriptor uses preparing',
      { progressDescription: '', descriptor: undefined },
      { kind: 'preparing' },
    ],
    [
      'no descriptor → preparing',
      { descriptor: undefined },
      { kind: 'preparing' },
    ],
    [
      'grace renewal descriptor',
      {
        descriptor: descriptor({ type: 'renew-grace', count: 3 }),
      },
      { kind: 'renew-grace', count: 3 },
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

describe('displayStepOf', () => {
  it.each([
    [0, 10, 1],
    [9, 10, 10],
    [15, 10, 10],
  ])('completed=%i total=%i → %i', (completed, total, expected) => {
    expect(displayStepOf(completed, total)).toBe(expected)
  })
})
