import { getAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { DESTINATION_CONTRACTS, getDestinationContracts } from './manifest'

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
      reverseRegistrarHcaAdapter: '0x56Bce5E727FAa9D237341Bb5B9E8a03D5919779d',
      legacyRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
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

describe('mainnet destination manifest', () => {
  it('pins the complete migration namespace and current HCA deployment', () => {
    const contracts = getDestinationContracts(mainnet.id)

    expect(contracts).toEqual({
      standaloneHcaFactory: '0x742bf21897a78e2C98cC5f5C5473A370a081e561',
      standaloneHcaImplementation: '0x116F462FA078ec0009e9b25DCd60309E70aaC4F4',
      hcaOwnerAndSessionValidator: '0xa818428ed2F3F949bdc71b8A15bDD7B5D27ce938',
      verifiableFactory: '0x77510ba162dfeA3d8989E3f0928a691B345730D2',
      verifiableFactoryProxyLogic: '0x8E77da0dAb32EfCc1C75e0Bd0e17680EBe0b1414',
      verifiableFactoryDeployBlock: 26_105_299n,
      permissionedResolverImpl: '0x565b0F456a04Ac9b48758190e90030623Cff57C5',
      ethRegistrar: '0xD6D8369e55c94Ae8AFA714E6cF7AB5bE54D5CC81',
      ethRegistry: '0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2',
      rootRegistry: '0x2553c09bE6447BeFfdB86FA622ad41fB8f77A91e',
      migrationHelper: '0x6c8452AFc6043b5aF32eb345A8135108906F07ee',
      unlockedMigrationController: '0xaB821Ca676CF2e0790Fa273526a165CFa86aEB64',
      lockedMigrationController: '0x3ceA18620883a69ED349B23328A3B6302598e51A',
      publicResolverSet: '0xfFCedA021CBDF20f1a66ebbef32E49d208cAbf62',
      userRegistryImpl: '0xC927bCaA77cd7bE283518760896Be0CF3Cfbe08d',
      wrapperRegistryImpl: '0xe86A4ef4d7A210aAA1d6A9594fC7Add7cD2Cf888',
      publicResolverV2: '0x66f9F566fF2f26309C1Bd9134388478A801dA3e1',
      defaultReverseRegistrarHcaAdapter:
        '0xd86E32499eCAFe9c181dd7410f93A1a9bB61ef0d',
      reverseRegistrarHcaAdapter: '0x349151735790269a9C14668B58D7C83b5ecb9607',
      legacyRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    })
  })
})
