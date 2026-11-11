import { describe, expect, it } from 'vitest'
import type { MigrationStepDescriptor } from './buildStepDescriptors'
import type { MigrationJournalOperation } from './migrationBatchJournal'
import {
  createMigrationProgress,
  getMigrationProgress,
  migrationProgressStepId,
  updateMigrationProgress,
} from './migrationProgress'

const operation = (name: string): MigrationJournalOperation => ({
  name,
  action: 'migrate',
})
const ALICE = operation('alice.eth')
const BOB = operation('bob.eth')
const batch = (operations: readonly MigrationJournalOperation[]) => ({
  descriptor: {
    type: 'atomic-batch',
    index: 0,
    total: 1,
    count: operations.length,
    migrateCount: operations.length,
    copyCount: 0,
    roleGrants: [],
  } satisfies MigrationStepDescriptor,
  operations,
})

describe('migration progress', () => {
  it('finishes a step once even when the same completion is delivered again', () => {
    const step = batch([ALICE])
    const state = createMigrationProgress([step])
    const event = {
      type: 'step-complete' as const,
      id: migrationProgressStepId(step),
    }
    const complete = updateMigrationProgress(state, event)
    expect(
      getMigrationProgress(updateMigrationProgress(complete, event)),
    ).toEqual(getMigrationProgress(complete))
    expect(getMigrationProgress(complete).currentStep).toBe(1)
  })

  it('keeps room for the second batch and its record replay when a live split is discovered', () => {
    const replay = {
      descriptor: { type: 'record-replay', index: 0, count: 2 } as const,
      operations: [ALICE, BOB],
    }
    const liveReplay = {
      descriptor: { type: 'record-replay', index: 0, count: 1 } as const,
      operations: [ALICE],
    }
    const state = updateMigrationProgress(
      createMigrationProgress([replay, batch([ALICE, BOB])]),
      {
        type: 'batch-built',
        operations: [ALICE],
        steps: [liveReplay, batch([ALICE])],
      },
    )
    const firstReplayDone = updateMigrationProgress(state, {
      type: 'step-complete',
      id: migrationProgressStepId(liveReplay),
    })
    expect(getMigrationProgress(firstReplayDone)).toMatchObject({
      currentStep: 1,
      totalSteps: 4,
      stepDescriptors: [
        { type: 'record-replay', count: 1 },
        { type: 'atomic-batch', index: 0, total: 2, count: 1 },
        { type: 'record-replay', count: 1 },
        { type: 'atomic-batch', index: 1, total: 2, count: 1 },
      ],
    })
  })

  it('settles only verified names in a partially recovered preview batch', () => {
    const event = { type: 'operations-recovered' as const, operations: [ALICE] }
    const recovered = updateMigrationProgress(
      createMigrationProgress([batch([ALICE, BOB])]),
      event,
    )
    expect(getMigrationProgress(recovered)).toMatchObject({
      currentStep: 1,
      totalSteps: 2,
      stepDescriptors: [{ count: 1 }, { count: 1 }],
    })
    expect(
      getMigrationProgress(updateMigrationProgress(recovered, event)),
    ).toEqual(getMigrationProgress(recovered))
  })

  it('updates a partially recovered legacy migration bundle without keeping its obsolete cleanup', () => {
    const original = batch([ALICE, BOB])
    const state = updateMigrationProgress(
      createMigrationProgress([
        {
          ...original,
          descriptor: {
            type: 'bundle',
            steps: [
              original.descriptor,
              { type: 'cleanup', approvalId: 'eth-registry:hca' },
            ],
          },
        },
      ]),
      { type: 'operations-recovered', operations: [ALICE] },
    )
    expect(getMigrationProgress(state).stepDescriptors).toMatchObject([
      { type: 'atomic-batch', index: 0, total: 2, count: 1 },
      { type: 'atomic-batch', index: 1, total: 2, count: 1 },
    ])
  })
})
