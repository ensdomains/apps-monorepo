import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { OWNER } from './_fixtures'
import { classifyNames, FUSES } from './classifyNames'
import type { V1Domain } from './v1Domain'

const LIVE_EXPIRY = '99999999999'
const EXPIRED = '100'

const lockedDomain = (params: {
  readonly name: string
  readonly parentName: string
  readonly parentFuses?: bigint
  readonly expiry?: string
}): V1Domain => ({
  id: params.name,
  labelName: params.name.split('.')[0] ?? params.name,
  labelhash: `0x${'0'.repeat(63)}1`,
  name: params.name,
  resolver: null,
  owner: { id: OWNER },
  registrant: null,
  wrappedOwner: { id: OWNER },
  parent: {
    name: params.parentName,
    wrappedDomain:
      params.parentFuses === undefined
        ? null
        : { fuses: Number(params.parentFuses) },
  },
  registration: null,
  wrappedDomain: {
    expiryDate: params.expiry ?? LIVE_EXPIRY,
    fuses: Number(FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL),
  },
})

const lockedChild = (expiry?: string): V1Domain =>
  lockedDomain({
    name: 'sub.bob.eth',
    parentName: 'bob.eth',
    parentFuses: FUSES.CANNOT_UNWRAP,
    expiry,
  })

describe('classifyNames known bugs (WEB-1942)', () => {
  // classifyLockedWrapper never checks the parent, so a locked child whose parent is not migrated or classified is offered and later fails route resolution. Remove .fails when fixed.
  it.fails('WEB-1942 #3: marks a locked child ineligible when its parent is neither migrated nor classified', () => {
    const child = lockedChild()

    const result = classifyNames([child], OWNER, sepolia.id)

    expect(result.classified.map(({ domain }) => domain.name)).toEqual([])
    expect(result.ineligible).toEqual([
      { domain: child, reason: expect.any(String) },
    ])
  })

  // classifyLockedWrapper has no expiry check, so an expired locked child the owner still holds is classified as migratable. Remove .fails when fixed.
  it.fails('WEB-1942 #4: marks an expired locked child held by the owner as expired-registration', () => {
    const parent = lockedDomain({ name: 'bob.eth', parentName: 'eth' })
    const child = lockedChild(EXPIRED)

    const result = classifyNames([parent, child], OWNER, sepolia.id)

    expect(result.classified.map(({ domain }) => domain.name)).toEqual([
      'bob.eth',
    ])
    expect(result.ineligible).toEqual([
      { domain: child, reason: 'expired-registration' },
    ])
  })
})
