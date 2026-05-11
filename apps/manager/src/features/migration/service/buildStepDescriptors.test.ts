import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import { buildStepDescriptors } from './buildStepDescriptors'
import type { GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

const emptyGroups = (): GroupedNames => ({
  unwrapped: [],
  unlocked: [],
  locked2ld: [],
  childNames: new Map(),
})

const preflight = (
  o: Partial<MigrationPreflight> = {},
): MigrationPreflight => ({
  preExistingOwnedPermRes: null,
  skipApprovalPhase: true,
  skipFetchProfilesPhase: true,
  needsBaseRegistrarApproval: false,
  needsNameWrapperApproval: false,
  ...o,
})

const build = (
  classified: readonly Parameters<typeof makeClassified>[0][] = [{}],
  p: Partial<MigrationPreflight> = {},
) =>
  buildStepDescriptors(
    classified.map(makeClassified),
    emptyGroups(),
    preflight(p),
  )

describe('buildStepDescriptors', () => {
  it('emits one helper migration step by default', () => {
    expect(build()).toEqual([{ type: 'migrate-helper', count: 1 }])
  })

  it('places registrar and wrapper approval steps before helper migration', () => {
    expect(
      build([{}, { tokenType: 'unlocked' }], {
        skipApprovalPhase: false,
        needsBaseRegistrarApproval: true,
        needsNameWrapperApproval: true,
      }),
    ).toEqual([
      { type: 'approve-base-registrar' },
      { type: 'approve-name-wrapper' },
      { type: 'migrate-helper', count: 2 },
    ])
  })

  it('only emits the missing approval steps', () => {
    expect(
      build([{}], {
        skipApprovalPhase: false,
        needsBaseRegistrarApproval: true,
      }),
    ).toEqual([
      { type: 'approve-base-registrar' },
      { type: 'migrate-helper', count: 1 },
    ])
  })

  it('returns no descriptors for an empty classified list', () => {
    expect(buildStepDescriptors([], emptyGroups(), preflight())).toEqual([])
  })
})
