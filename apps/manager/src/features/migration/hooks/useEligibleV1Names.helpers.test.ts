import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDomain, OTHER, OWNER } from '../service/_fixtures'
import { classifyNames, type IneligibleName } from '../service/classifyNames'
import {
  getGracePeriodNames,
  getNextNameExpiryBoundary,
} from './useEligibleV1Names.helpers'

const EXPIRY = 2_000_000_000n
const GRACE_SECONDS = 7_776_000n

const expiredName = (
  overrides: Parameters<typeof makeDomain>[0] = {},
): IneligibleName => ({
  domain: makeDomain({ registrationExpiry: String(EXPIRY), ...overrides }),
  reason: 'expired-registration',
})

afterEach(() => vi.restoreAllMocks())

describe('getNextNameExpiryBoundary', () => {
  it('advances from registration expiry to grace end and stops after grace', () => {
    const domains = [expiredName().domain]

    expect(getNextNameExpiryBoundary(domains, EXPIRY - 1n)).toBe(EXPIRY)
    expect(getNextNameExpiryBoundary(domains, EXPIRY)).toBe(
      EXPIRY + GRACE_SECONDS,
    )
    expect(
      getNextNameExpiryBoundary(domains, EXPIRY + GRACE_SECONDS),
    ).toBeNull()
  })

  it('uses wrapper boundaries when the registration expiry is absent', () => {
    const domains = [
      expiredName({
        isWrapped: true,
        registrationExpiry: null,
        wrappedExpiry: String(EXPIRY + GRACE_SECONDS),
      }).domain,
    ]

    expect(getNextNameExpiryBoundary(domains, EXPIRY - 1n)).toBe(EXPIRY)
    expect(getNextNameExpiryBoundary(domains, EXPIRY)).toBe(
      EXPIRY + GRACE_SECONDS,
    )
    expect(
      getNextNameExpiryBoundary(domains, EXPIRY + GRACE_SECONDS),
    ).toBeNull()
  })

  it('chooses the earliest future boundary across registrations and wrapped subnames', () => {
    const domains = [
      expiredName({ registrationExpiry: String(EXPIRY + 10n) }).domain,
      expiredName({
        name: 'sub.alice.eth',
        parentName: 'alice.eth',
        isWrapped: true,
        registrationExpiry: null,
        wrappedExpiry: String(EXPIRY + 5n),
      }).domain,
    ]

    expect(getNextNameExpiryBoundary(domains, EXPIRY)).toBe(EXPIRY + 5n)
    expect(getNextNameExpiryBoundary(domains, EXPIRY + 5n)).toBe(EXPIRY + 10n)
  })
})

describe('getGracePeriodNames', () => {
  it.each([
    false,
    true,
  ])('uses the registration expiry for the grace window (wrapped: %s)', (isWrapped) => {
    const name = expiredName({ isWrapped })

    expect(getGracePeriodNames([name], EXPIRY - 1n)).toEqual([])
    expect(getGracePeriodNames([name], EXPIRY)).toEqual([name])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS - 1n)).toEqual([
      name,
    ])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS)).toEqual([])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS + 1n)).toEqual([])
  })

  it('falls back to the wrapper grace window when the registration expiry is absent', () => {
    const name = expiredName({
      isWrapped: true,
      registrationExpiry: null,
      wrappedExpiry: String(EXPIRY + GRACE_SECONDS),
    })

    expect(getGracePeriodNames([name], EXPIRY - 1n)).toEqual([])
    expect(getGracePeriodNames([name], EXPIRY)).toEqual([name])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS - 1n)).toEqual([
      name,
    ])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS)).toEqual([])
    expect(getGracePeriodNames([name], EXPIRY + GRACE_SECONDS + 1n)).toEqual([])
  })

  it('prefers registration expiry when the wrapper would imply a different grace window', () => {
    const activeRegistration = expiredName({
      isWrapped: true,
      registrationExpiry: String(EXPIRY + 1n),
      wrappedExpiry: String(EXPIRY + GRACE_SECONDS),
    })
    const pastGraceRegistration = expiredName({
      isWrapped: true,
      registrationExpiry: String(EXPIRY - GRACE_SECONDS),
      wrappedExpiry: String(EXPIRY + GRACE_SECONDS),
    })
    const staleWrapper = expiredName({
      isWrapped: true,
      wrappedExpiry: String(EXPIRY - 1n),
    })

    expect(
      getGracePeriodNames(
        [activeRegistration, pastGraceRegistration, staleWrapper],
        EXPIRY,
      ),
    ).toEqual([staleWrapper])
  })

  it('excludes names with no expiry, other ineligibility reasons, and subnames', () => {
    const missingExpiry = expiredName({ registrationExpiry: null })
    const unsupportedResolver: IneligibleName = {
      ...expiredName(),
      reason: 'unsupported-resolver',
    }
    const subname = expiredName({
      name: 'sub.alice.eth',
      parentName: 'alice.eth',
    })
    const nonEthName = expiredName({ name: 'alice.com', parentName: 'com' })
    const missingParent = expiredName({ parentName: null })

    expect(
      getGracePeriodNames(
        [
          missingExpiry,
          unsupportedResolver,
          subname,
          nonEthName,
          missingParent,
        ],
        EXPIRY,
      ),
    ).toEqual([])
  })

  it('sorts names alphabetically without changing the input', () => {
    const zebra = expiredName({ name: 'zebra.eth' })
    const alice = expiredName({ name: 'alice.eth' })
    const names = Object.freeze([zebra, alice])

    expect(getGracePeriodNames(names, EXPIRY)).toEqual([alice, zebra])
    expect(names).toEqual([zebra, alice])
  })

  it('retains the classifier ownership and label checks when using the current time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Number(EXPIRY) * 1000)
    const owned = expiredName().domain
    const unowned = makeDomain({
      registrantId: OTHER,
      registrationExpiry: String(EXPIRY),
    })
    const unknownLabel = makeDomain({
      labelName: null,
      registrationExpiry: String(EXPIRY),
    })
    const invalidLabel = makeDomain({
      labelName: 'invalid.label',
      registrationExpiry: String(EXPIRY),
    })
    const { ineligible } = classifyNames(
      [owned, unowned, unknownLabel, invalidLabel],
      OWNER,
      sepolia.id,
    )

    expect(getGracePeriodNames(ineligible)).toEqual([
      { domain: owned, reason: 'expired-registration' },
    ])
  })
})
