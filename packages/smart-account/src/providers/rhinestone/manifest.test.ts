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
      standaloneHcaFactory: '0x6Bad0176236e97b346B5Dd13BCc8325B931EE8ab',
      standaloneHcaImplementation: '0xC940e5C5bF263C0e097054AECf73826769A72CEE',
      hcaOwnerAndSessionValidator: '0x4bF641590ab18E31B9F8789A3417A2620f860466',
      verifiableFactory: '0xDa70306C98E97eCe36F997a21368e53298572991',
      verifiableFactoryProxyLogic: '0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd',
      verifiableFactoryDeployBlock: 11_820_318n,
      permissionedResolverImpl: '0x115eb53F0c60696633855F90b138178Fb40b2b2C',
      ethRegistrar: '0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3',
      ethRegistry: '0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4',
      rootRegistry: '0xB458D6a3a77919449d03e7A6903C26827c1eC43f',
      migrationHelper: '0xA8F86EE5cdD28703bd876F3a8c10B1DE70f36899',
      unlockedMigrationController: '0x2a35B94DF22cc7354570be2284655E2CDC0e64A2',
      lockedMigrationController: '0x6029a063d69b09D23c52a754a90E4FE43aDac3A8',
      publicResolverSet: '0x5B2bd5208dac31905106d8e5a4973Ae1Cd7414F2',
      userRegistryImpl: '0x9BD8a88719068D09ecee662f36C0E3856708366a',
      wrapperRegistryImpl: '0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880',
      publicResolverV2: '0xdC4a563d00F5c3012b699794eB9e13A561Be386F',
      defaultReverseRegistrarHcaAdapter:
        '0x36f97328e843e37520cbF530e9402791c2754066',
      usdc: '0x240b0316Df57887DBBE58b586508b19e633a14aa',
    })
  })

  it('contains only checksummed addresses alongside the bigint deploy block', () => {
    const contracts = getDestinationContracts(sepolia.id)
    expect(contracts.verifiableFactoryDeployBlock).toBe(11_820_318n)

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
