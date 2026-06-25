import {
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
} from '@ens-apps/transaction-manager'
import type { Address } from 'viem'
import { decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'
import type { RenewableGraceName } from './classifyNames'
import { buildLegacyGraceRenewalCall } from './legacyGraceRenewal'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'

const graceName = {
  label: 'legacy',
  domain: {
    id: '0x01',
    name: 'legacy.eth',
    labelName: 'legacy',
  } as V1Domain,
  renewalDurationSeconds: 604_801,
  tokenHolder: OWNER,
} as RenewableGraceName

describe('buildLegacyGraceRenewalCall', () => {
  it('encodes legacy controller renew with the fixed duration and ETH value', () => {
    const call = buildLegacyGraceRenewalCall({
      name: graceName,
      price: 123n,
    })

    expect(call.to).toBe(ENS_SEPOLIA_CONTRACTS.ETHRegistrarController)
    expect(call.value).toBe(123n)
    expect(
      decodeFunctionData({
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        data: call.data,
      }),
    ).toEqual({
      functionName: 'renew',
      args: ['legacy', 604_801n],
    })
  })
})
