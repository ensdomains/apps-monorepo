import { type Address, decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'
import { ETH_REGISTRY_V2_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import type { ClassifiedName } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const MANAGER: Address = '0x0000000000000000000000000000000000000099'

const ROLE_SET_RESOLVER = 1n << 12n

const makeClassified = (
  managerAddress: Address | null,
  label = 'alice',
): ClassifiedName => ({
  tokenType: 'unwrapped',
  label,
  parentName: 'eth',
  fuses: 0,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress,
  domain: { id: '0x01', name: `${label}.eth` } as unknown as V1Domain,
})

describe('buildRoleGrantCall', () => {
  it('targets the v2 ETHRegistry with ROLE_SET_RESOLVER for the manager', () => {
    const name = makeClassified(MANAGER, 'bob')
    const call = buildRoleGrantCall(name)

    expect(call.to).toBe(V2_CONTRACTS.ETHRegistry)
    expect(call.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: ETH_REGISTRY_V2_ABI,
      data: call.data,
    })
    expect(functionName).toBe('grantRoles')
    const [, roles, account] = args as [bigint, bigint, Address]
    expect(roles).toBe(ROLE_SET_RESOLVER)
    expect(account.toLowerCase()).toBe(MANAGER.toLowerCase())
  })

  it('throws when manager is null', () => {
    expect(() => buildRoleGrantCall(makeClassified(null))).toThrow(
      /No manager address/i,
    )
  })
})
