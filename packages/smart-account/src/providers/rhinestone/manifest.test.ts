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
      standaloneHcaFactory: '0xb85152A8EF4dB5CaF37Af6bffce66B559a9C0B58',
      standaloneHcaImplementation: '0x7328a1926B45F0339913Ab654fb98d1A0f5ec894',
      hcaOwnerAndSessionValidator: '0x5f249FCa8bB4949105651146858c347E8BFb0F7E',
      verifiableFactory: '0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780',
      verifiableFactoryProxyLogic: '0x2fDCaC2F94B2E65c5d5fBf36EC34483d25Ca9025',
      verifiableFactoryDeployBlock: 11_626_639n,
      permissionedResolverImpl: '0xa9d3814AB151BF6E37A427432795371a8361614e',
      ethRegistrar: '0x7d1B7f586a62Ac3F54b9A396849757814283270b',
      ethRegistry: '0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e',
      rootRegistry: '0x8115186E8f2E0B0281e86ab91f0f48Ba90364354',
      migrationHelper: '0xddC597d937618849348E18Db5D631Ce747bCDeEF',
      unlockedMigrationController: '0x97494264AD5437611CC2f43987c21F6F352D786a',
      lockedMigrationController: '0x7fa65c83Dd80Cca2Fbd91e16a6dc4F66B64eFE22',
      publicResolverSet: '0xf2794eBD70C1fa74094A9eC653DA1c2dF9f5a5A9',
      userRegistryImpl: '0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546',
      wrapperRegistryImpl: '0x433F81a3E8921Fc868ae1A04576f135d9A75B0f2',
      publicResolverV2: '0xe7B9A25607E02da8145E4eB1836CA539e53F11f7',
      defaultReverseRegistrarHcaAdapter:
        '0x7a84e241f862D73960D73c26d68c3C8F89F0B18F',
      usdc: '0xcBFD80F74375c54E545AF34788Ff465F96F66F05',
    })
  })

  it('contains only checksummed addresses alongside the bigint deploy block', () => {
    const contracts = getDestinationContracts(sepolia.id)
    expect(contracts.verifiableFactoryDeployBlock).toBe(11_626_639n)

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
