import { type Address, decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'
import { ETH_REGISTRY_V2_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import { buildRoleGrantCall, ROLE_SET_RESOLVER } from './buildRoleGrantCalls'

const MANAGER: Address = '0x0000000000000000000000000000000000000099'

const decodeGrant = (data: `0x${string}`) => {
  const { functionName, args } = decodeFunctionData({
    abi: ETH_REGISTRY_V2_ABI,
    data,
  })
  const [resource, roles, account] = args as [bigint, bigint, Address]
  return { functionName, resource, roles, account }
}

describe('buildRoleGrantCall', () => {
  it('targets the v2 ETHRegistry with ROLE_SET_RESOLVER for the manager', () => {
    const call = buildRoleGrantCall(
      makeClassified({
        managerAddress: MANAGER,
        label: 'bob',
        name: 'bob.eth',
      }),
    )
    expect(call.to).toBe(V2_CONTRACTS.ETHRegistry)
    expect(call.value).toBe(0n)

    const { functionName, roles, account } = decodeGrant(call.data)
    expect(functionName).toBe('grantRoles')
    expect(roles).toBe(ROLE_SET_RESOLVER)
    expect(account.toLowerCase()).toBe(MANAGER.toLowerCase())
  })

  it('throws when manager is null', () => {
    expect(() => buildRoleGrantCall(makeClassified())).toThrow(
      /No manager address/i,
    )
  })

  it('grants only the manager role, never an admin bit (WEB-1528)', () => {
    // An `_ADMIN` role administers itself, so granting one requires already
    // holding it: an admin grant here could only ever succeed where it was
    // already a no-op, and would revert the whole atomic batch otherwise.
    const { roles } = decodeGrant(
      buildRoleGrantCall(makeClassified({ managerAddress: MANAGER })).data,
    )

    const ADMIN_BITS = ((1n << 128n) - 1n) << 128n
    expect(roles & ADMIN_BITS).toBe(0n)
    expect(roles).toBe(ROLE_SET_RESOLVER)
  })
})
