import { describe, expect, it } from 'vitest'
import { v2GraceStatus } from './useGraceStatus'

const EXPIRY = 1_801_373_280
const DAY = 24 * 60 * 60

describe('v2GraceStatus', () => {
  it('keeps a .eth name in grace until bigname says it ends', () => {
    const graceEnd = EXPIRY + 28 * DAY
    expect(v2GraceStatus({ expiry: EXPIRY, graceEnd }, EXPIRY + DAY)).toEqual({
      isInGrace: true,
      isExpired: true,
      graceEndDate: new Date(graceEnd * 1000),
    })
  })

  it('gives a subname no grace when bigname ends it at expiry', () => {
    expect(
      v2GraceStatus({ expiry: EXPIRY, graceEnd: EXPIRY }, EXPIRY + DAY),
    ).toMatchObject({ isInGrace: false, isExpired: true })
  })

  it('adds no grace when bigname serves none', () => {
    expect(
      v2GraceStatus({ expiry: EXPIRY, graceEnd: null }, EXPIRY + DAY),
    ).toMatchObject({ isInGrace: false, isExpired: true })
  })
})
