import { type Address, encodeAbiParameters, pad, toEventSelector } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  computeResolverSalt,
  getDestinationContracts,
} from './providers/rhinestone/manifest'
import {
  computeVerifiableProxyAddress,
  findDeployedProxyAddress,
  type ProxyDeployedLogLike,
} from './verifiable-factory'

const HCA = '0xaaaa000000000000000000000000000000000001' as const

describe('computeVerifiableProxyAddress', () => {
  it('derives the pinned VerifiableFactory CREATE2 address', () => {
    const contracts = getDestinationContracts(sepolia.id)

    expect(
      computeVerifiableProxyAddress({
        factory: contracts.verifiableFactory,
        proxyLogic: contracts.verifiableFactoryProxyLogic,
        deployer: HCA,
        salt: computeResolverSalt(HCA),
      }),
    ).toBe('0x3f30117Db553fc15aB3FFBD1287f4E8838D53C14')
  })

  it('namespaces the same salt by deployer', () => {
    const contracts = getDestinationContracts(sepolia.id)
    const first = computeVerifiableProxyAddress({
      factory: contracts.verifiableFactory,
      proxyLogic: contracts.verifiableFactoryProxyLogic,
      deployer: HCA,
      salt: 1n,
    })
    const second = computeVerifiableProxyAddress({
      factory: contracts.verifiableFactory,
      proxyLogic: contracts.verifiableFactoryProxyLogic,
      deployer: '0xbbbb000000000000000000000000000000000002',
      salt: 1n,
    })

    expect(first).not.toBe(second)
  })
})

describe('findDeployedProxyAddress', () => {
  const FACTORY = '0xda70306c98e97ece36f997a21368e53298572991' as const
  const OTHER_FACTORY = '0x9999999999999999999999999999999999999999' as const
  const RESOLVER = '0x1111111111111111111111111111111111111111' as const
  const OTHER_RESOLVER = '0x2222222222222222222222222222222222222222' as const
  const DEPLOYER = '0x3333333333333333333333333333333333333333' as const
  const IMPLEMENTATION = '0x4444444444444444444444444444444444444444' as const

  const proxyDeployedLog = (
    address: Address,
    proxyAddress: Address,
  ): ProxyDeployedLogLike => ({
    address,
    topics: [
      toEventSelector('ProxyDeployed(address,address,uint256,address)'),
      pad(DEPLOYER),
      pad(proxyAddress),
    ],
    data: encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }],
      [1n, IMPLEMENTATION],
    ),
  })

  it('reads the proxy the factory deployed', () => {
    expect(
      findDeployedProxyAddress({
        logs: [proxyDeployedLog(FACTORY, RESOLVER)],
        factory: FACTORY,
      }),
    ).toBe(RESOLVER)
  })

  it('ignores a ProxyDeployed emitted by another contract', () => {
    expect(
      findDeployedProxyAddress({
        logs: [
          proxyDeployedLog(OTHER_FACTORY, OTHER_RESOLVER),
          proxyDeployedLog(FACTORY, RESOLVER),
        ],
        factory: FACTORY,
      }),
    ).toBe(RESOLVER)
  })

  it('returns null when only another contract announced a proxy', () => {
    expect(
      findDeployedProxyAddress({
        logs: [proxyDeployedLog(OTHER_FACTORY, OTHER_RESOLVER)],
        factory: FACTORY,
      }),
    ).toBeNull()
  })

  it('refuses a receipt in which the factory announced two proxies', () => {
    expect(() =>
      findDeployedProxyAddress({
        logs: [
          proxyDeployedLog(FACTORY, RESOLVER),
          proxyDeployedLog(FACTORY, OTHER_RESOLVER),
        ],
        factory: FACTORY,
      }),
    ).toThrow(/Expected one ProxyDeployed log/)
  })
})
