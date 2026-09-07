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
      hcaOwnerAndSessionValidator: '0xeb099163a41912A94E56b2143fEB6eB7979a51f0',
      verifiableFactory: '0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780',
      verifiableFactoryProxyLogic: '0x2fDCaC2F94B2E65c5d5fBf36EC34483d25Ca9025',
      verifiableFactoryDeployBlock: 11_626_639n,
      permissionedResolverImpl: '0xa9d3814AB151BF6E37A427432795371a8361614e',
      ethRegistrar: '0x7d1B7f586a62Ac3F54b9A396849757814283270b',
      ethRegistry: '0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e',
      rootRegistry: '0xe7f0D5724f8337e3Aa9A9910540341Ff4273fEd9',
      migrationHelper: '0x540f222a6FD9A54E77989556f366940d1ad81aec',
      unlockedMigrationController: '0x97494264AD5437611CC2f43987c21F6F352D786a',
      lockedMigrationController: '0x7fa65c83Dd80Cca2Fbd91e16a6dc4F66B64eFE22',
      publicResolverSet: '0x3866e84B54a78d1e3778421E0fbf3607fA9c402f',
      userRegistryImpl: '0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546',
      wrapperRegistryImpl: '0x7c53b9dceF516662E9e8a229448CaC30b90673CD',
      publicResolverV2: '0xF9de4979DdB290baF5B760D0e788125017Bc33f6',
      defaultReverseRegistrarHcaAdapter:
        '0x0A8d7eD4061548FB3CB192d0cBE9E1A57B3B1ae9',
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
