import { describe, expect, it } from 'vitest'
import { getRenewerAddress } from './renewer'
import {
  computeRenewerPayments,
  distinctRenewers,
  planMultiRenewSteps,
} from './renewerPayments'

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

describe('planMultiRenewSteps', () => {
  const payment = (renewer: string, total: bigint, allowance: bigint) => ({
    renewer: renewer as `0x${string}`,
    total,
    allowance,
  })

  it('returns no steps for an empty batch', () => {
    expect(planMultiRenewSteps([], [payment(V1, 10n, 0n)])).toEqual([])
  })

  it('emits one renew for a same-renewer batch when its allowance covers it', () => {
    const renewals = [entry(true, 'a.eth'), entry(true, 'b.eth')]
    const steps = planMultiRenewSteps(renewals, [payment(V2, 10n, 10n)])
    expect(steps).toEqual([
      { kind: 'renew', renewer: getRenewerAddress(true), renewals },
    ])
  })

  it('emits two approvals for a mixed batch — first clears, second skips — then one renew per renewer', () => {
    const [v1a, v2a, v1b] = [
      entry(false, 'v1a.eth'),
      entry(true, 'v2a.eth'),
      entry(false, 'v1b.eth'),
    ]
    const steps = planMultiRenewSteps(
      [v1a, v2a, v1b],
      [payment(V1, 5n, 0n), payment(V2, 8n, 0n)],
    )
    expect(steps).toEqual([
      { kind: 'approve', renewer: V1, total: 5n, skipClear: false },
      { kind: 'approve', renewer: V2, total: 8n, skipClear: true },
      {
        kind: 'renew',
        renewer: getRenewerAddress(false),
        renewals: [v1a, v1b],
      },
      { kind: 'renew', renewer: getRenewerAddress(true), renewals: [v2a] },
    ])
  })

  it('skips the covered renewer and keeps the first uncovered one clearing', () => {
    const steps = planMultiRenewSteps(
      [entry(false, 'v1.eth'), entry(true, 'v2.eth')],
      [payment(V1, 5n, 5n), payment(V2, 8n, 0n)],
    )
    // V1 already covered → only V2 approves, and being the first (and only)
    // approval it must clear the manager.
    expect(steps.filter((s) => s.kind === 'approve')).toEqual([
      { kind: 'approve', renewer: V2, total: 8n, skipClear: false },
    ])
  })
})
