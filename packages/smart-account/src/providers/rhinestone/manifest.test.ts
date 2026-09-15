import { getAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  DESTINATION_CONTRACTS,
  getDestinationContracts,
  SHARED_CONTRACTS,
  SOURCE_CONTRACTS,
} from './manifest'

/**
 * Guards against a mis-checksummed contract address reaching viem, which
 * rejects a mixed-case address whose EIP-55 checksum does not match with
 * `Address "0x…" is invalid` — at transaction-submission time, in the user's
 * wallet.
 *
 * Nothing else catches it: a wrong-case character type-checks, lints, and even
 * works under `cast`, which does not verify checksums. Addresses sourced from
 * ensjs are already canonical; the risk is entirely in the literals typed here
 * by hand from a deployment doc.
 */
const expectChecksummed = (label: string, address: string) => {
  expect(
    () => getAddress(address),
    `${label} is not a valid address`,
  ).not.toThrow()
  expect(getAddress(address), `${label} is not EIP-55 checksummed`).toBe(
    address,
  )
}

// Generic over the per-chain table type: the contract tables are interfaces,
// which have no index signature and so do not satisfy `Record<string, unknown>`.
const addressEntriesOf = <T extends object>(table: Record<number, T>) =>
  Object.entries(table).flatMap(([chainId, contracts]) =>
    Object.entries(contracts as Record<string, unknown>).flatMap(
      ([name, value]) =>
        typeof value === 'string'
          ? [[`${chainId}.${name}`, value] as const]
          : [],
    ),
  )

describe('remediated Sepolia destination manifest', () => {
  it('pins the complete migration namespace and current HCA deployment', () => {
    const contracts = getDestinationContracts(sepolia.id)

    expect(contracts).toEqual({
      standaloneHcaFactory: '0xB7CFeCEeD32DBa66c507b3c002dAD510b8399928',
      standaloneHcaImplementation: '0xdF4a24c42921810fed9363b07292E9152578D706',
      hcaOwnerAndSessionValidator: '0x6A62Af42D4241a02547b096C7DB43ca6411AF813',
      verifiableFactory: '0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C',
      verifiableFactoryProxyLogic: '0xC6dbA04e7c6264e85A459Dd592a6CBC2D2a6Ad8E',
      verifiableFactoryDeployBlock: 11_708_995n,
      permissionedResolverImpl: '0x14F09Fd05d4585759e54844DC9B00147131Cf243',
      ethRegistrar: '0xAbe76F6C8DFcEd81AA5A2bB8034202A7136b94ca',
      ethRegistry: '0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E',
      rootRegistry: '0x9703DBD26dAB89504490994138cF2c575251a9cE',
      migrationHelper: '0x58d12d60471b98F191856e4C2d56886e9c3eA573',
      unlockedMigrationController: '0x7ed171bb143a905F56105e4eA146543Ecb122F55',
      lockedMigrationController: '0xab1B57C6eE5E91e6090595c0AF14CB9B8bc7773f',
      publicResolverSet: '0xd12aF6aC82648056Fe7D6B2a9dB97235Aa509021',
      userRegistryImpl: '0xA80338aAA8D23831cEa25E858D1774534aBb0263',
      wrapperRegistryImpl: '0x2741543c3B14640b97bC70a233318032f7E35bAC',
      publicResolverV2: '0xd7e590Ad0E92A6aC1d81f4483A9B951D3585a50F',
      defaultReverseRegistrarHcaAdapter:
        '0x4F32A1c62E202922d4d6307126F43218DB9dA6f5',
      usdc: '0x16f95D91DBa7dA3Aca778Ec053dF0FF6C6A8aA8e',
    })
  })

  it('contains only checksummed addresses alongside the bigint deploy block', () => {
    const contracts = getDestinationContracts(sepolia.id)
    expect(contracts.verifiableFactoryDeployBlock).toBe(11_708_995n)

    for (const [label, address] of addressEntriesOf(DESTINATION_CONTRACTS)) {
      expectChecksummed(label, address)
    }
  })
})

describe('contract manifest addresses', () => {
  it.each(
    addressEntriesOf(SOURCE_CONTRACTS),
  )('SOURCE_CONTRACTS.%s is checksummed', (label, address) => {
    expectChecksummed(label, address)
  })

  it.each(
    Object.entries(SHARED_CONTRACTS),
  )('SHARED_CONTRACTS.%s is checksummed', (label, address) => {
    expectChecksummed(label, address)
  })
})
