import { describe, expect, it } from 'vitest'
import type { MigrationJournalOperation } from './migrationBatchJournal'
import {
  describeRecoveredOperations,
  describeUpgradeOperations,
} from './migrationProgressCopy'

const upgrade = { name: 'alice.eth', action: 'migrate' } as const
const copy = { name: 'bob.eth', action: 'copy' } as const

const cases: readonly {
  readonly operations: readonly MigrationJournalOperation[]
  readonly progress: string
  readonly recovered: string
}[] = [
  {
    operations: [upgrade],
    progress: 'Upgrading alice.eth',
    recovered: 'alice.eth was already upgraded',
  },
  {
    operations: [copy],
    progress: 'Copying bob.eth',
    recovered: 'bob.eth was already copied',
  },
  {
    operations: [upgrade, { name: 'carol.eth', action: 'migrate' }],
    progress: 'Upgrading 2 names',
    recovered: '2 names were already upgraded',
  },
  {
    operations: [copy, { name: 'carol.eth', action: 'copy' }],
    progress: 'Copying 2 names',
    recovered: '2 names were already copied',
  },
  {
    operations: [upgrade, copy],
    progress: 'Upgrading 1 name, copying 1',
    recovered: '1 already upgraded, 1 already copied',
  },
  {
    operations: [upgrade, copy, { name: 'carol.eth', action: 'migrate' }],
    progress: 'Upgrading 2 names, copying 1',
    recovered: '2 already upgraded, 1 already copied',
  },
]

describe('migration progress copy', () => {
  it.each(cases)('$progress', ({ operations, progress, recovered }) => {
    expect(describeUpgradeOperations(operations)).toBe(progress)
    expect(
      describeRecoveredOperations(
        operations.map(({ name }) => name),
        operations,
      ),
    ).toBe(recovered)
  })

  it('does not claim an upgrade or copy when the recovered action is unknown', () => {
    expect(describeRecoveredOperations(['alice.eth'], [])).toBe(
      'alice.eth was already done',
    )
    expect(describeRecoveredOperations(['alice.eth'], [copy])).toBe(
      'alice.eth was already done',
    )
  })
})
