import { describe, expect, it } from 'vitest'
import { getRenewerAddress } from './renewer'
import { computeRenewerPayments, distinctRenewers } from './renewerPayments'

const entry = (isV2: boolean, name = `${isV2 ? 'v2' : 'v1'}.eth`) => ({
  selectedName: { name, isV2, expiryDate: null },
  duration: 1,
})

const V1 = '0x1111111111111111111111111111111111111111' as const
const V2 = '0x2222222222222222222222222222222222222222' as const

const allowances = (map: Record<string, bigint>) => (renewer: string) =>
  map[renewer] ?? 0n

describe('computeRenewerPayments', () => {
  it('sums charges per renewer into one payment each', () => {
    const payments = computeRenewerPayments(
      [
        { renewer: V2, total: 10n },
        { renewer: V1, total: 3n },
        { renewer: V2, total: 5n },
      ],
      allowances({ [V1]: 0n, [V2]: 100n }),
    )

    expect(payments).toEqual([
      { renewer: V2, total: 15n, allowance: 100n },
      { renewer: V1, total: 3n, allowance: 0n },
    ])
  })

  it('preserves first-seen renewer order', () => {
    const payments = computeRenewerPayments(
      [
        { renewer: V1, total: 1n },
        { renewer: V2, total: 2n },
      ],
      allowances({}),
    )

    expect(payments.map((p) => p.renewer)).toEqual([V1, V2])
  })

  it('yields a single payment for a same-renewer batch', () => {
    const payments = computeRenewerPayments(
      [
        { renewer: V2, total: 4n },
        { renewer: V2, total: 6n },
      ],
      allowances({ [V2]: 10n }),
    )

    expect(payments).toEqual([{ renewer: V2, total: 10n, allowance: 10n }])
  })

  it('returns no payments for an empty batch', () => {
    expect(computeRenewerPayments([], allowances({}))).toEqual([])
  })

  it('attaches each renewer its own allowance', () => {
    const payments = computeRenewerPayments(
      [
        { renewer: V1, total: 7n },
        { renewer: V2, total: 8n },
      ],
      allowances({ [V1]: 50n, [V2]: 0n }),
    )

    expect(payments).toEqual([
      { renewer: V1, total: 7n, allowance: 50n },
      { renewer: V2, total: 8n, allowance: 0n },
    ])
  })
})

describe('distinctRenewers', () => {
  it('collapses a same-kind batch to one renewer', () => {
    expect(distinctRenewers([entry(true), entry(true, 'other.eth')])).toEqual([
      getRenewerAddress(true),
    ])
  })

  it('returns both renewers for a mixed batch, in first-seen order', () => {
    expect(distinctRenewers([entry(false), entry(true)])).toEqual([
      getRenewerAddress(false),
      getRenewerAddress(true),
    ])
  })

  it('returns no renewers for an empty batch', () => {
    expect(distinctRenewers([])).toEqual([])
  })
})
