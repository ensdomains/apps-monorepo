import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  makeDomain,
  OWNER,
} from '../../src/features/migration/service/_fixtures'
import {
  classifyName,
  classifyNames,
  FUSES,
} from '../../src/features/migration/service/classifyNames'
import {
  classifyMigrationRecoverySubmission,
  type MigrationJournalOperation,
} from '../../src/features/migration/service/migrationBatchJournal'

const NOW_SECONDS = 2_000_000_000n

describe('migration classification matrix', () => {
  it.each([
    ['unwrapped', {}, 'migrate', 'unwrapped'],
    ['unlocked', { isWrapped: true, fuses: 0n }, 'migrate', 'unlocked'],
    [
      'locked-2ld',
      { isWrapped: true, fuses: FUSES.CANNOT_UNWRAP },
      'migrate',
      'locked-2ld',
    ],
    [
      'locked-child',
      {
        isWrapped: true,
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        fuses: FUSES.CANNOT_UNWRAP,
      },
      'migrate',
      'locked-child',
    ],
    [
      'detached-child',
      {
        isWrapped: true,
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        fuses: FUSES.PARENT_CANNOT_CONTROL,
      },
      'migrate',
      'detached-child',
    ],
    [
      'unlocked-child',
      {
        isWrapped: true,
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        fuses: 0n,
        resolverAddress: null,
      },
      'copy',
      'unlocked-child',
    ],
    [
      'registry-child',
      {
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        registrantId: null,
        resolverAddress: null,
      },
      'copy',
      'registry-child',
    ],
  ] as const)('classifies %s', (_, overrides, action, tokenType) => {
    const result = classifyName(makeDomain(overrides), OWNER, sepolia.id, {
      nowSeconds: NOW_SECONDS,
    })

    expect(result).toMatchObject({
      type: 'classified',
      name: { action, tokenType },
    })
  })

  it.each([
    ['selected root', [makeDomain()], 1, 0],
    [
      'selected copy route',
      [
        makeDomain(),
        makeDomain({
          name: 'sub.alice.eth',
          labelName: 'sub',
          parentName: 'alice.eth',
          registrantId: null,
          resolverAddress: null,
        }),
      ],
      2,
      0,
    ],
    [
      'copy without selected route',
      [
        makeDomain({
          name: 'sub.alice.eth',
          labelName: 'sub',
          parentName: 'alice.eth',
          registrantId: null,
          resolverAddress: null,
        }),
      ],
      0,
      1,
    ],
  ] as const)(
    '%s has a total route result',
    (_, domains, classified, ineligible) => {
      const result = classifyNames(domains, OWNER, sepolia.id, {
        nowSeconds: NOW_SECONDS,
      })

      expect(result.classified).toHaveLength(classified)
      expect(result.ineligible).toHaveLength(ineligible)
      expect(result.classified.length + result.ineligible.length).toBe(
        domains.length,
      )
    },
  )
})

describe('journaled operation reconciliation matrix', () => {
  const registryOperations: readonly MigrationJournalOperation[] = [
    { name: 'alice.eth', action: 'migrate' },
  ]

  it.each([
    ['alice.eth', 'migrate', 'matching'],
    ['alice.eth', 'copy', 'mismatch'],
    ['bob.eth', 'migrate', 'unrelated'],
    ['bob.eth', 'copy', 'unrelated'],
  ] as const)('%s with %s is %s', (name, action, expected) => {
    expect(
      classifyMigrationRecoverySubmission({
        registryOperations,
        operations: [{ name, action }],
      }),
    ).toBe(expected)
  })
})
