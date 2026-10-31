import { describe, expect, it } from 'vitest'
import { getRecordEditLock } from './recordEditLock'

const FUSED = { cannotSetResolver: true, cannotUnwrap: true }

describe('getRecordEditLock', () => {
  it('locks a name whose resolver refuses the owner and whose fuses block recovery', () => {
    expect(
      getRecordEditLock({
        hasResolverCode: true,
        fuses: FUSED,
        canWriteOnResolver: false,
      }),
    ).toBe('resolver-locked')
  })

  // WEB-1324: a call to an account with no code succeeds, so the write probe
  // says "writable" even though no record write can ever land.
  it.each([
    ['the write probe accepts it', undefined, true],
    ['the name is also fuse-locked', FUSED, false],
  ] as const)(
    'locks a resolver with no code even when %s',
    (_, fuses, canWriteOnResolver) => {
      expect(
        getRecordEditLock({
          hasResolverCode: false,
          fuses,
          canWriteOnResolver,
        }),
      ).toBe('resolver-not-contract')
    },
  )

  // Unknown writability must not take the editor from someone who can use it.
  it.each([
    ['the resolver accepts the write', FUSED, true],
    ['writability is unknown', FUSED, undefined],
    [
      'the resolver can still be replaced',
      { ...FUSED, cannotSetResolver: false },
      false,
    ],
    [
      'the name can still be unwrapped',
      { ...FUSED, cannotUnwrap: false },
      false,
    ],
    ['the name is not wrapped', undefined, false],
  ] as const)('does not lock when %s', (_, fuses, canWriteOnResolver) => {
    expect(
      getRecordEditLock({ hasResolverCode: true, fuses, canWriteOnResolver }),
    ).toBeUndefined()
  })

  it('does not lock while it is unknown whether the resolver has code', () => {
    expect(
      getRecordEditLock({
        hasResolverCode: undefined,
        fuses: undefined,
        canWriteOnResolver: true,
      }),
    ).toBeUndefined()
  })
})
