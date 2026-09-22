import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { type Address, decodeFunctionData, type WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  generateSubregistrySalt,
  prepareDeploySubregistryTransaction,
} from './deploySubregistry'

const factoryAddress = '0x1111111111111111111111111111111111111111' as Address
const implAddress = '0x3333333333333333333333333333333333333333' as Address
const from = '0x2222222222222222222222222222222222222222' as Address
const walletClient = {
  account: { address: from },
  chain: { id: 11155111 },
} as unknown as WalletClient

const deployArgs = (salt: bigint) => {
  const { request } = prepareDeploySubregistryTransaction({
    factoryAddress,
    implAddress,
    salt,
    walletClient,
    chainId: 11155111,
  })
  if (request.type !== 'eoa' || !request.data)
    throw new Error('expected an EOA request with calldata')
  return decodeFunctionData({
    abi: verifiableFactoryDeployProxySnippet,
    data: request.data,
  }).args
}

describe('prepareDeploySubregistryTransaction', () => {
  it('deploys the registry implementation under the salt it is given', () => {
    // Not ensjs's default: that one is fixed per page load, and the factory
    // binds the proxy address to (sender, salt), so a wallet's second deploy
    // would revert.
    const salt = generateSubregistrySalt()
    const [impl, encodedSalt] = deployArgs(salt)

    expect(impl).toBe(implAddress)
    expect(encodedSalt).toBe(salt)
  })
})

describe('generateSubregistrySalt', () => {
  it('draws a fresh 256-bit salt every call', () => {
    const salts = Array.from({ length: 32 }, generateSubregistrySalt)

    expect(new Set(salts).size).toBe(salts.length)
    for (const salt of salts) {
      expect(salt).toBeGreaterThanOrEqual(0n)
      expect(salt).toBeLessThan(2n ** 256n)
    }
  })
})
