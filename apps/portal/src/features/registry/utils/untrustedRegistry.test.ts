import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { isUntrustedRegistryImplementation } from './untrustedRegistry'

const UNTRUSTED_V0 = '0x75FF9AdBcFcE2469B097AC68f6Ae650EaE1351Bb'
const UNTRUSTED_V1 = '0xfaa23592aca10a6d8875b18ea86954e8eb6d8d72'
const TRUSTED = '0xC927bCaA77cd7bE283518760896Be0CF3Cfbe08d'

describe('isUntrustedRegistryImplementation', () => {
  it.each([
    ['flags the first mainnet implementation', mainnet.id, UNTRUSTED_V0, true],
    ['flags the redeployed one in any case', mainnet.id, UNTRUSTED_V1, true],
    ['passes the current implementation', mainnet.id, TRUSTED, false],
    ['passes a contract that is no proxy', mainnet.id, null, false],
    [
      'passes the same address on another chain',
      sepolia.id,
      UNTRUSTED_V0,
      false,
    ],
  ] as const)('%s', (_, chainId, implementation, expected) => {
    expect(isUntrustedRegistryImplementation({ chainId, implementation })).toBe(
      expected,
    )
  })
})
