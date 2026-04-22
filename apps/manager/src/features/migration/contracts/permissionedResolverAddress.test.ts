import type { Address } from 'viem'
import { decodeFunctionData, parseAbiItem } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from './permissionedResolverAddress'

const OWNER_A: Address = '0x0000000000000000000000000000000000000001'
const OWNER_B: Address = '0x0000000000000000000000000000000000000002'

describe('computeOwnedResolverSalt', () => {
  it('is deterministic for the same owner and version', () => {
    expect(computeOwnedResolverSalt(OWNER_A, 0n)).toBe(
      computeOwnedResolverSalt(OWNER_A, 0n),
    )
  })

  it('defaults version to 0 when omitted', () => {
    expect(computeOwnedResolverSalt(OWNER_A)).toBe(
      computeOwnedResolverSalt(OWNER_A, 0n),
    )
  })

  it('differs across distinct owners', () => {
    expect(computeOwnedResolverSalt(OWNER_A, 0n)).not.toBe(
      computeOwnedResolverSalt(OWNER_B, 0n),
    )
  })

  it('differs across distinct versions for the same owner', () => {
    expect(computeOwnedResolverSalt(OWNER_A, 0n)).not.toBe(
      computeOwnedResolverSalt(OWNER_A, 1n),
    )
  })

  it('is a bigint', () => {
    expect(typeof computeOwnedResolverSalt(OWNER_A, 0n)).toBe('bigint')
  })
})

describe('getOwnedPermResInitCalldata', () => {
  it('encodes initialize(admin, ALL_ROLES) — admin matches input', () => {
    const data = getOwnedPermResInitCalldata(OWNER_A)
    const { functionName, args } = decodeFunctionData({
      abi: [
        parseAbiItem(
          'function initialize(address admin, uint256 allRoles) external',
        ),
      ],
      data,
    })
    expect(functionName).toBe('initialize')
    expect((args as [Address, bigint])[0].toLowerCase()).toBe(
      OWNER_A.toLowerCase(),
    )
  })

  it('passes a non-zero role mask', () => {
    const data = getOwnedPermResInitCalldata(OWNER_A)
    const { args } = decodeFunctionData({
      abi: [
        parseAbiItem(
          'function initialize(address admin, uint256 allRoles) external',
        ),
      ],
      data,
    })
    expect((args as [Address, bigint])[1]).toBeGreaterThan(0n)
  })

  it('differs across distinct admins', () => {
    expect(getOwnedPermResInitCalldata(OWNER_A)).not.toBe(
      getOwnedPermResInitCalldata(OWNER_B),
    )
  })
})
