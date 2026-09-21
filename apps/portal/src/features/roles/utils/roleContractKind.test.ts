import { toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  classifyRoleContract,
  PERMISSIONED_REGISTRY_INTERFACE_ID,
} from './roleContractKind'

describe('PERMISSIONED_REGISTRY_INTERFACE_ID', () => {
  it('is the XOR of the selectors IPermissionedRegistry declares', () => {
    // contracts-v2 @ 71a3b733, contracts/src/registry/interfaces/IPermissionedRegistry.sol.
    // `State` is (uint8 status, uint64 expiry, address, uint256, uint256) and
    // `IRegistryURIRenderer` is an address, but neither appears in a selector.
    const declared = [
      'setURI(string,address)',
      'getURI()',
      'latestOwnerOf(uint256)',
      'getState(uint256)',
      'getStatus(uint256)',
      'getResource(uint256)',
      'getTokenId(uint256)',
      'getOwner(uint256)',
      'isEmancipated()',
    ]
    const id = declared.reduce(
      (acc, signature) => acc ^ Number(toFunctionSelector(signature)),
      0,
    )

    expect(`0x${(id >>> 0).toString(16).padStart(8, '0')}`).toBe(
      PERMISSIONED_REGISTRY_INTERFACE_ID,
    )
  })
})

describe('classifyRoleContract', () => {
  it('reads an allowlisted resolver as a permissioned resolver', () => {
    expect(
      classifyRoleContract({
        isPermissionedResolver: true,
        isPermissionedRegistry: false,
      }),
    ).toBe('permissioned-resolver')
  })

  it('reads a contract reporting IPermissionedRegistry as a registry', () => {
    expect(
      classifyRoleContract({
        isPermissionedResolver: false,
        isPermissionedRegistry: true,
      }),
    ).toBe('registry')
  })

  it('refuses a contract that claims both models', () => {
    expect(
      classifyRoleContract({
        isPermissionedResolver: true,
        isPermissionedRegistry: true,
      }),
    ).toBe('unsupported')
  })

  it('refuses a contract that is neither', () => {
    expect(
      classifyRoleContract({
        isPermissionedResolver: false,
        isPermissionedRegistry: false,
      }),
    ).toBe('unsupported')
  })
})
