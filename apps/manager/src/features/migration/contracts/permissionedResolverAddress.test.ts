import { type Address, decodeFunctionData, type Hex, parseAbiItem } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from './permissionedResolverAddress'

const OWNER_A: Address = '0x0000000000000000000000000000000000000001'
const OWNER_B: Address = '0x0000000000000000000000000000000000000002'

const initializeAbi = [
  parseAbiItem(
    'function initialize(address admin, uint256 allRoles, bytes[] setters) external',
  ),
]

describe('computeOwnedResolverSalt', () => {
  it('is deterministic and returns a bigint', () => {
    const salt = computeOwnedResolverSalt(OWNER_A, 0n)
    expect(salt).toBe(computeOwnedResolverSalt(OWNER_A, 0n))
    expect(typeof salt).toBe('bigint')
  })

  it('defaults version to 0 when omitted', () => {
    expect(computeOwnedResolverSalt(OWNER_A)).toBe(
      computeOwnedResolverSalt(OWNER_A, 0n),
    )
  })

  it.each([
    [
      'owners',
      () => computeOwnedResolverSalt(OWNER_A, 0n),
      () => computeOwnedResolverSalt(OWNER_B, 0n),
    ],
    [
      'versions',
      () => computeOwnedResolverSalt(OWNER_A, 0n),
      () => computeOwnedResolverSalt(OWNER_A, 1n),
    ],
  ])('differs across distinct %s', (_, a, b) => {
    expect(a()).not.toBe(b())
  })
})

describe('getOwnedPermResInitCalldata', () => {
  it('encodes initialize(admin, non-zero roles, no setters)', () => {
    const { functionName, args } = decodeFunctionData({
      abi: initializeAbi,
      data: getOwnedPermResInitCalldata(OWNER_A),
    })
    expect(functionName).toBe('initialize')
    const [admin, roles, setters] = args as [Address, bigint, readonly Hex[]]
    expect(admin.toLowerCase()).toBe(OWNER_A.toLowerCase())
    expect(roles).toBeGreaterThan(0n)
    expect(setters).toEqual([])
  })

  it('differs across distinct admins', () => {
    expect(getOwnedPermResInitCalldata(OWNER_A)).not.toBe(
      getOwnedPermResInitCalldata(OWNER_B),
    )
  })
})
