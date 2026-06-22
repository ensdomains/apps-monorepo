import {
  type Address,
  decodeFunctionData,
  type Hex,
  maxUint48,
  parseAbi,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  buildAddSessionOwnerCall,
  buildRemoveSessionOwnerCall,
  ENS_HCA_MODULE_ADDRESS,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './registration-policy'

const SESSION_KEY: Address = '0x3333333333333333333333333333333333333333'
const VALID_UNTIL_SEC = 2_000_000_000 // 2033-05-18

const abi = parseAbi([
  'struct Owner { address addr; uint48 expiration; }',
  'function updateConfig(uint256 newThreshold, Owner[] ownersToAdd, address[] ownersToRemove)',
])

const decode = (data: Hex) =>
  decodeFunctionData({ abi, data }) as {
    functionName: 'updateConfig'
    args: readonly [
      bigint,
      readonly { addr: Address; expiration: number | bigint }[],
      readonly Address[],
    ]
  }

describe('buildAddSessionOwnerCall', () => {
  const call = buildAddSessionOwnerCall({
    sessionKeyAddress: SESSION_KEY,
    validUntil: VALID_UNTIL_SEC,
  })

  it('targets the HCA validator module with zero value', () => {
    expect(call.to).toBe(ENS_HCA_MODULE_ADDRESS)
    expect(call.value).toBe(0n)
  })

  it('encodes updateConfig adding the session key as a time-boxed owner, threshold 1', () => {
    const { functionName, args } = decode(call.data)
    expect(functionName).toBe('updateConfig')
    const [threshold, ownersToAdd, ownersToRemove] = args
    expect(threshold).toBe(1n)
    expect(ownersToAdd).toHaveLength(1)
    expect(ownersToAdd[0].addr.toLowerCase()).toBe(SESSION_KEY.toLowerCase())
    expect(BigInt(ownersToAdd[0].expiration)).toBe(BigInt(VALID_UNTIL_SEC))
    expect(ownersToRemove).toHaveLength(0)
  })

  it('refuses a permanent (max) expiration — session owners must be time-boxed', () => {
    expect(() =>
      buildAddSessionOwnerCall({
        sessionKeyAddress: SESSION_KEY,
        validUntil: Number(maxUint48),
      }),
    ).toThrow(/finite/i)
  })
})

describe('buildRemoveSessionOwnerCall', () => {
  it('encodes updateConfig removing the session key, threshold 1', () => {
    const call = buildRemoveSessionOwnerCall({ sessionKeyAddress: SESSION_KEY })
    expect(call.to).toBe(ENS_HCA_MODULE_ADDRESS)
    const { functionName, args } = decode(call.data)
    expect(functionName).toBe('updateConfig')
    const [threshold, ownersToAdd, ownersToRemove] = args
    expect(threshold).toBe(1n)
    expect(ownersToAdd).toHaveLength(0)
    expect(ownersToRemove).toHaveLength(1)
    expect(ownersToRemove[0].toLowerCase()).toBe(SESSION_KEY.toLowerCase())
  })
})

describe('REGISTRATION_SESSION_VALIDITY_SECONDS', () => {
  it('is 1 week', () => {
    expect(REGISTRATION_SESSION_VALIDITY_SECONDS).toBe(7 * 24 * 60 * 60)
  })
})
