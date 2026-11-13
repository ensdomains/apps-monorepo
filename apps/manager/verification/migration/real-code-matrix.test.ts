import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  makeDomain,
  OTHER,
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

  it.each([
    { case: 'classified root', domain: makeDomain(), bucket: 'classified' },
    {
      case: 'missing label',
      domain: makeDomain({ labelName: null }),
      bucket: 'ineligible',
    },
    {
      case: 'unknown label',
      domain: makeDomain({
        labelName: `[${'0'.repeat(64)}]`,
        name: `[${'0'.repeat(64)}].eth`,
      }),
      bucket: 'ineligible',
    },
    {
      case: 'invalid label',
      domain: makeDomain({ labelName: 'bad.label' }),
      bucket: 'ineligible',
    },
    {
      case: 'copy without a selected route',
      domain: makeDomain({
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        registrantId: null,
        resolverAddress: null,
      }),
      bucket: 'ineligible',
    },
  ] as const)(
    '$case lands in exactly the $bucket bucket',
    ({ domain, bucket }) => {
      const result = classifyName(domain, OWNER, sepolia.id, {
        nowSeconds: NOW_SECONDS,
      })
      expect(result).not.toBeNull()

      const classified = classifyNames([domain], OWNER, sepolia.id, {
        nowSeconds: NOW_SECONDS,
      })
      expect({
        classified: classified.classified.length,
        ineligible: classified.ineligible.length,
      }).toEqual({
        classified: bucket === 'classified' ? 1 : 0,
        ineligible: bucket === 'ineligible' ? 1 : 0,
      })
    },
  )

  it.each([
    ['not registrant', { registrantId: OTHER }],
    ['wrapped by another account', { isWrapped: true, wrappedOwnerId: OTHER }],
    ['non-.eth name', { name: 'alice.xyz', parentName: 'xyz' }],
    [
      'subname registry owner mismatch',
      {
        name: 'sub.alice.eth',
        labelName: 'sub',
        parentName: 'alice.eth',
        registrantId: null,
        ownerId: OTHER,
      },
    ],
  ] as const)(
    'intentionally excludes %s null classifications',
    (_, overrides) => {
      const domain = makeDomain(overrides)
      expect(
        classifyName(domain, OWNER, sepolia.id, { nowSeconds: NOW_SECONDS }),
      ).toBeNull()

      expect(
        classifyNames([domain], OWNER, sepolia.id, {
          nowSeconds: NOW_SECONDS,
        }),
      ).toEqual({ classified: [], ineligible: [] })
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
