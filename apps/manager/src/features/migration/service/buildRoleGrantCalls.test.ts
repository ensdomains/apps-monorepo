import { type Address, decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'
import { ETH_REGISTRY_V2_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import {
  buildRoleAdminGrantCall,
  buildRoleGrantCall,
  ROLE_SET_RESOLVER,
  ROLE_SET_RESOLVER_ADMIN,
} from './buildRoleGrantCalls'

const MANAGER: Address = '0x0000000000000000000000000000000000000099'
const OWNER: Address = '0x0000000000000000000000000000000000000001'

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
})

describe('buildRoleAdminGrantCall', () => {
  it('grants the admin counterpart to the migrating owner on the same resource', () => {
    const name = makeClassified({
      managerAddress: MANAGER,
      label: 'bob',
      name: 'bob.eth',
    })
    const grant = decodeGrant(buildRoleGrantCall(name).data)
    const adminCall = buildRoleAdminGrantCall({ name, migrationOwner: OWNER })

    expect(adminCall.to).toBe(V2_CONTRACTS.ETHRegistry)
    expect(adminCall.value).toBe(0n)

    const admin = decodeGrant(adminCall.data)
    expect(admin.functionName).toBe('grantRoles')
    expect(admin.resource).toBe(grant.resource)
    expect(admin.roles).toBe(ROLE_SET_RESOLVER_ADMIN)
    expect(admin.account.toLowerCase()).toBe(OWNER.toLowerCase())
  })

  it('never hands the admin role to the restored manager', () => {
    const name = makeClassified({ managerAddress: MANAGER })
    const { account } = decodeGrant(
      buildRoleAdminGrantCall({ name, migrationOwner: OWNER }).data,
    )

    expect(account.toLowerCase()).not.toBe(MANAGER.toLowerCase())
  })

  it('places the admin role 128 bits above the role it administers', () => {
    expect(ROLE_SET_RESOLVER_ADMIN).toBe(ROLE_SET_RESOLVER << 128n)
  })
})
