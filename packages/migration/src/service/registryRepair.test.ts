import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  userRegistryInitializeSnippet,
  userRegistryRegisterSnippet,
  userRegistrySetParentSnippet,
  userRegistrySetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/userRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  decodeFunctionData,
  getAddress,
  type Hex,
  labelhash,
  zeroAddress,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  compareRegistryRepair,
  planRegistryRepair,
  type RegistryRepairName,
  type RegistryRepairState,
} from './registryRepair'

const FACTORY = getAddress('0x00000000000000000000000000000000000000fa')
const IMPLEMENTATION = getAddress('0x00000000000000000000000000000000000001aa')
const REPLACEMENT = getAddress('0x00000000000000000000000000000000000002bb')
const PARENT_REGISTRY = getAddress('0x00000000000000000000000000000000000003cc')
const CONTROLLER = getAddress('0x0000000000000000000000000000000000000c01')
const HCA = getAddress('0x0000000000000000000000000000000000000c02')
const ALICE = getAddress('0x0000000000000000000000000000000000000a11')
const BOB = getAddress('0x0000000000000000000000000000000000000b0b')
const RESOLVER = getAddress('0x00000000000000000000000000000000000004dd')
const CHILD_REGISTRY = getAddress('0x00000000000000000000000000000000000005ee')
const SALT = 7n
const ALL = 0x1111n
const SOME = 0x10n

const makeName = (
  overrides: Partial<RegistryRepairName> = {},
): RegistryRepairName => ({
  label: 'alice',
  owner: ALICE,
  subregistry: zeroAddress,
  resolver: RESOLVER,
  expiry: 2_000_000_000n,
  roles: [{ account: ALICE, roleBitmap: ALL }],
  ...overrides,
})

const makeState = (
  overrides: Partial<RegistryRepairState> = {},
): RegistryRepairState => ({
  parentRegistry: PARENT_REGISTRY,
  parentLabel: 'parent',
  parentTokenId: 42n,
  rootRoles: [
    { account: CONTROLLER, roleBitmap: ALL },
    { account: HCA, roleBitmap: ALL },
  ],
  names: [makeName()],
  ...overrides,
})

const plan = (state: RegistryRepairState) =>
  planRegistryRepair({
    state,
    factory: FACTORY,
    implementation: IMPLEMENTATION,
    salt: SALT,
    replacement: REPLACEMENT,
  })

const ABI = [
  ...verifiableFactoryDeployProxySnippet,
  ...userRegistryInitializeSnippet,
  ...userRegistrySetParentSnippet,
  ...userRegistryRegisterSnippet,
  ...eacGrantRolesSnippet,
  ...userRegistrySetSubregistrySnippet,
]
const decode = (data: Hex) => decodeFunctionData({ abi: ABI, data })

describe('planRegistryRepair', () => {
  it('deploys with the root roles, sets the parent, copies each name, then switches the parent name', () => {
    const name = makeName({
      label: 'alice',
      subregistry: CHILD_REGISTRY,
      roles: [
        { account: ALICE, roleBitmap: ALL },
        { account: BOB, roleBitmap: SOME },
      ],
    })
    const calls = plan(makeState({ names: [name] }))._unsafeUnwrap().calls

    expect(calls.map((c) => [c.to, decode(c.data).functionName])).toEqual([
      [FACTORY, 'deployProxy'],
      [REPLACEMENT, 'setParent'],
      [REPLACEMENT, 'register'],
      [REPLACEMENT, 'grantRoles'],
      [PARENT_REGISTRY, 'setSubregistry'],
    ])

    const [deploy, setParent, register, grant, switchParent] = calls.map((c) =>
      decode(c.data),
    )
    expect(deploy?.args?.slice(0, 2)).toEqual([IMPLEMENTATION, SALT])
    expect(
      decodeFunctionData({
        abi: userRegistryInitializeSnippet,
        data: deploy?.args?.[2] as Hex,
      }).args,
    ).toEqual([
      [
        { account: CONTROLLER, roleBitmap: ALL },
        { account: HCA, roleBitmap: ALL },
      ],
    ])
    expect(setParent?.args).toEqual([PARENT_REGISTRY, 'parent'])
    expect(register?.args).toEqual([
      'alice',
      ALICE,
      CHILD_REGISTRY,
      RESOLVER,
      ALL,
      2_000_000_000n,
    ])
    expect(grant?.args).toEqual([
      BigInt(labelhash('alice')) & ~0xffff_ffffn,
      SOME,
      BOB,
    ])
    expect(switchParent?.args).toEqual([42n, REPLACEMENT])
  })

  it.each([
    [
      'no-root-roles',
      makeState({ rootRoles: [{ account: CONTROLLER, roleBitmap: 0n }] }),
    ],
    [
      'name-without-owner',
      makeState({ names: [makeName({ owner: zeroAddress })] }),
    ],
    ['duplicate-label', makeState({ names: [makeName(), makeName()] })],
  ] as const)('refuses a state with %s', (reason, state) => {
    expect(plan(state)._unsafeUnwrapErr().reason).toBe(reason)
  })
})

describe('compareRegistryRepair', () => {
  it('finds nothing when the copy matches', () => {
    expect(compareRegistryRepair(makeState(), makeState())).toEqual([])
  })

  it('reports each field, role and name the copy lost', () => {
    const before = makeState({
      names: [makeName(), makeName({ label: 'bob', owner: BOB, roles: [] })],
    })
    const after = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: ALL }],
      names: [
        makeName({
          resolver: zeroAddress,
          roles: [{ account: ALICE, roleBitmap: SOME }],
        }),
      ],
    })

    expect(compareRegistryRepair(before, after)).toEqual([
      { kind: 'root-roles', account: HCA },
      { kind: 'name-field', label: 'alice', field: 'resolver' },
      { kind: 'name-roles', label: 'alice', account: ALICE },
      { kind: 'missing-name', label: 'bob' },
    ])
  })
})
