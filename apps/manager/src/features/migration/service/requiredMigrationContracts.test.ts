import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import { type ClassifiedName, FUSES } from './classifyNames'
import type { DirectMigrationRoute } from './directMigrationRoutes'
import { getRequiredMigrationContracts } from './migrationInvariants'

const HCA: Address = '0x0000000000000000000000000000000000000001'
const RESOLVER: Address = '0x0000000000000000000000000000000000000002'
const WRAPPER: Address = '0x0000000000000000000000000000000000000003'
const KNOWN_RESOLVER = '0x640294a2b2d87e7f522db3e3e3e876764bce170d'
const select = (
  remaining: readonly ClassifiedName[],
  options: Partial<Parameters<typeof getRequiredMigrationContracts>[0]> = {},
) =>
  getRequiredMigrationContracts({
    remaining,
    registryContext: remaining,
    directRoutes: new Map(),
    hcaReadiness: { status: 'verified', hca: HCA, implementation: HCA },
    resolverReadiness: {
      status: 'verified',
      resolver: RESOLVER,
      implementation: RESOLVER,
      hcaHasRootRoles: true,
      walletHasWildcardRoles: true,
    },
    ownedResolver: RESOLVER,
    ...options,
  })
const route = (
  name: ClassifiedName,
  overrides: Partial<DirectMigrationRoute> = {},
): ReadonlyMap<string, DirectMigrationRoute> =>
  new Map([
    [
      name.domain.name,
      {
        name: name.domain.name,
        receiver: V2_CONTRACTS.UnlockedMigrationController,
        parentDependency: null,
        expectedWrapperRegistry: null,
        receiverReadiness: 'migration-controller',
        ...overrides,
      },
    ],
  ])

describe('getRequiredMigrationContracts', () => {
  it.each([
    'unwrapped',
    'unlocked',
  ] as const)('requires only the %s route and owned resolver', (tokenType) => {
    const name = makeClassified({ tokenType })
    expect([...select([name], { directRoutes: route(name) })].sort()).toEqual(
      [
        'ETHRegistry',
        'StandaloneHCAFactory',
        'VerifiableFactory',
        'MigrationHelper',
        'UnlockedMigrationController',
        'PermissionedResolverImpl',
      ].sort(),
    )
  })

  it('adds only the locked route, wrapper deployment and applicable public resolver set', () => {
    const name = makeClassified({
      tokenType: 'locked-2ld',
      fuses: FUSES.CANNOT_SET_RESOLVER,
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: KNOWN_RESOLVER,
    })
    const contracts = select([name], {
      directRoutes: route(name, {
        receiver: V2_CONTRACTS.LockedMigrationController,
        expectedWrapperRegistry: WRAPPER,
      }),
    })
    expect(contracts).toEqual(
      expect.arrayContaining([
        'LockedMigrationController',
        'WrapperRegistryImpl',
        'VerifiableFactoryProxyLogic',
        'PublicResolverSet',
        'DefaultResolver',
      ]),
    )
    expect(contracts).not.toEqual(
      expect.arrayContaining(['UnlockedMigrationController']),
    )
    expect(contracts).not.toContain('PermissionedResolverImpl')
    expect(contracts).not.toContain('RootRegistry')
  })

  it.each([
    'locked-child',
    'detached-child',
  ] as const)('checks the parent wrapper for %s without requiring a root controller', (tokenType) => {
    const name = makeClassified({
      tokenType,
      name: 'sub.alice.eth',
      parentName: 'alice.eth',
    })
    const contracts = select([name], {
      directRoutes: route(name, {
        receiver: WRAPPER,
        receiverReadiness: 'existing-verified-wrapper',
        expectedWrapperRegistry: tokenType === 'locked-child' ? RESOLVER : null,
      }),
    })
    expect(contracts).toEqual(
      expect.arrayContaining([
        'MigrationHelper',
        'RootRegistry',
        'ETHRegistry',
        'WrapperRegistryImpl',
      ]),
    )
    expect(contracts).not.toContain('LockedMigrationController')
    expect(contracts).not.toContain('UnlockedMigrationController')
    expect(contracts.includes('VerifiableFactoryProxyLogic')).toBe(
      tokenType === 'locked-child',
    )
  })

  it('retains a completed copy parent without requiring its migration or redeployment', () => {
    const parent = makeClassified()
    const child = makeClassified({
      action: 'copy',
      name: 'sub.alice.eth',
      parentName: 'alice.eth',
    })
    const contracts = select([child], { registryContext: [parent, child] })
    expect(contracts).toContain('UserRegistryImpl')
    expect(contracts).toContain('ETHRegistry')
    expect(contracts).not.toContain('MigrationHelper')
    expect(contracts).not.toContain('VerifiableFactoryProxyLogic')
    expect(contracts).not.toContain('UnlockedMigrationController')
  })

  it('includes proxy logic for the remaining parent of a copied child in a mixed plan', () => {
    const parent = makeClassified()
    const child = makeClassified({
      action: 'copy',
      name: 'sub.alice.eth',
      parentName: 'alice.eth',
    })
    const contracts = select([parent, child], { directRoutes: route(parent) })
    expect(contracts).toEqual(
      expect.arrayContaining([
        'MigrationHelper',
        'UnlockedMigrationController',
        'UserRegistryImpl',
        'VerifiableFactoryProxyLogic',
      ]),
    )
    expect(new Set(contracts).size).toBe(contracts.length)
  })

  it('requires implementation and validator only when deploying an HCA', () => {
    const name = makeClassified()
    const existing = select([name])
    expect(existing).not.toContain('StandaloneHCAImplementation')
    expect(existing).not.toContain('HCAOwnerAndSessionValidator')
    expect(
      select([name], {
        hcaReadiness: { status: 'deployment-required', hca: HCA },
      }),
    ).toEqual(
      expect.arrayContaining([
        'StandaloneHCAImplementation',
        'HCAOwnerAndSessionValidator',
        'VerifiableFactoryProxyLogic',
      ]),
    )
  })

  it('requires proxy logic only for a resolver the remaining names need to deploy', () => {
    const name = makeClassified()
    expect(
      select([name], {
        resolverReadiness: {
          status: 'deployment-required',
          resolver: RESOLVER,
        },
      }),
    ).toContain('VerifiableFactoryProxyLogic')
    const custom = makeClassified({
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: RESOLVER,
    })
    const contracts = select([custom], {
      resolverReadiness: { status: 'deployment-required', resolver: RESOLVER },
    })
    expect(contracts).not.toContain('VerifiableFactoryProxyLogic')
    expect(contracts).not.toContain('DefaultResolver')
    expect(contracts).not.toContain('PermissionedResolverImpl')
  })

  it('requires no contracts when no operations remain', () => {
    expect(select([], { registryContext: [makeClassified()] })).toEqual([])
  })
})
