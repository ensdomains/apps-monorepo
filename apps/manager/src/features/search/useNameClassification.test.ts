import { describe, expect, it } from 'vitest'
import { toExistenceSignal, toTldSupportSignal } from './useNameClassification'

describe('toExistenceSignal', () => {
  it('does not trust stale owner data after an owner refetch fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: false,
      }),
    ).toEqual({ status: 'unknown' })
  })

  it('trusts a positive source when the other source fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: true,
      }),
    ).toEqual({ status: 'owned' })
  })
})

describe('toTldSupportSignal', () => {
  it('skips the lookup when TLD support cannot affect the outcome', () => {
    expect(
      toTldSupportSignal({
        isEnabled: false,
        isError: false,
        isDnsSecEnabled: undefined,
      }),
    ).toEqual({ status: 'skipped' })
  })

  it('reports a failed lookup as an error, not unsupported', () => {
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: true,
        isDnsSecEnabled: false,
      }),
    ).toEqual({ status: 'error' })
  })

  it('maps a DNSSEC result to supported or unsupported', () => {
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: false,
        isDnsSecEnabled: true,
      }),
    ).toEqual({ status: 'supported' })
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: false,
        isDnsSecEnabled: false,
      }),
    ).toEqual({ status: 'unsupported' })
  })
})
