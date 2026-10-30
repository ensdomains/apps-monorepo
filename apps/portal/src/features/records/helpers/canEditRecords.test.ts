import { describe, expect, it } from 'vitest'
import { canEditRecords } from './canEditRecords'

const run = (overrides: Partial<Parameters<typeof canEditRecords>[0]> = {}) =>
  canEditRecords({
    isSettled: true,
    isPermissioned: false,
    isV2: false,
    hasGrant: false,
    canWriteOnResolver: undefined,
    isOwner: true,
    editLock: undefined,
    ...overrides,
  })

describe('canEditRecords', () => {
  // WEB-1324: a resolver set to a wallet. Each branch would otherwise say yes
  // (ownership, a granted role, a write probe that "succeeds") and send a
  // record write the wallet then rejects.
  it.each([
    ['a v1 owner', {}],
    [
      'a granted resolver role',
      { isPermissioned: true, hasGrant: true, isOwner: false },
    ],
    ['a v2 write probe that passes', { isV2: true, canWriteOnResolver: true }],
  ] as const)('refuses %s when the resolver is not a contract', (_, branch) => {
    expect(run({ ...branch, editLock: 'resolver-not-contract' })).toBe(false)
  })

  it.each([
    ['a v1 owner', {}, true],
    [
      'a v1 owner shut out by burnt fuses',
      { editLock: 'resolver-locked' },
      false,
    ],
    ['a v1 non-owner', { isOwner: false }, false],
    [
      'a granted role, whatever the fuse lock says',
      { isPermissioned: true, hasGrant: true, editLock: 'resolver-locked' },
      true,
    ],
    ['a permissioned resolver with no grant', { isPermissioned: true }, false],
    [
      'a v2 write probe that passes',
      { isV2: true, canWriteOnResolver: true },
      true,
    ],
    ['an unknown v2 write probe', { isV2: true }, false],
    ['unsettled reads', { isSettled: false }, false],
  ] as const)('answers for %s', (_, branch, expected) => {
    expect(run(branch)).toBe(expected)
  })
})
