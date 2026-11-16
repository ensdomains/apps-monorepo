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
  type RegistryChild,
  type RegistryRepairName,
  type RegistryRepairState,
  splitRepairNames,
  toRegistryChildren,
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
  expiredLabels: [],
  ...overrides,
})

const plan = (
  state: RegistryRepairState,
  {
    existing = null,
    children = [],
  }: {
    readonly existing?: RegistryRepairState | null
    readonly children?: readonly RegistryChild[]
  } = {},
) =>
  planRegistryRepair({
    state,
    existing,
    children,
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
    const { copyCalls, finalCalls } = plan(
      makeState({ names: [name] }),
    )._unsafeUnwrap()
    const calls = [...copyCalls, ...finalCalls]

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

describe('planRegistryRepair, resuming a copy', () => {
  const BOB_NAME = makeName({
    label: 'bob',
    owner: BOB,
    roles: [{ account: BOB, roleBitmap: ALL }],
  })
  const functionsOf = (calls: readonly { readonly data: Hex }[]) =>
    calls.map((c) => {
      const { functionName, args } = decode(c.data)
      return [functionName, args?.[0]]
    })

  it('plans only the names the replacement is missing', () => {
    const state = makeState({ names: [makeName(), BOB_NAME] })
    const existing = makeState({ names: [makeName()] })

    expect(
      functionsOf(plan(state, { existing })._unsafeUnwrap().copyCalls),
    ).toEqual([['register', 'bob']])
  })

  it('sets the parent when the stop came right after the deploy', () => {
    const existing = makeState({
      parentRegistry: zeroAddress,
      parentLabel: '',
      names: [],
    })

    expect(
      functionsOf(plan(makeState(), { existing })._unsafeUnwrap().copyCalls),
    ).toEqual([
      ['setParent', PARENT_REGISTRY],
      ['register', 'alice'],
    ])
  })

  it('grants only the role bits a copied name still lacks', () => {
    const state = makeState({
      names: [
        makeName({
          roles: [
            { account: ALICE, roleBitmap: ALL },
            { account: BOB, roleBitmap: SOME },
          ],
        }),
      ],
    })
    const [grant] = plan(state, { existing: makeState() })._unsafeUnwrap()
      .copyCalls

    expect(grant && decode(grant.data).args).toEqual([
      BigInt(labelhash('alice')) & ~0xffff_ffffn,
      SOME,
      BOB,
    ])
  })

  it.each([
    [
      'a copied name with another owner',
      makeState({ names: [makeName({ owner: BOB })] }),
    ],
    [
      'a copied name with roles the original lacks',
      makeState({
        names: [
          makeName({
            roles: [
              { account: ALICE, roleBitmap: ALL },
              { account: BOB, roleBitmap: SOME },
            ],
          }),
        ],
      }),
    ],
    [
      'different root roles',
      makeState({ rootRoles: [{ account: BOB, roleBitmap: ALL }] }),
    ],
  ])('refuses to resume onto %s', (_case, existing) => {
    expect(plan(makeState(), { existing })._unsafeUnwrapErr().reason).toBe(
      'replacement-diverged',
    )
  })
})

describe('planRegistryRepair, child registries', () => {
  const child = (
    label: string,
    overrides: Partial<RegistryChild> = {},
  ): RegistryChild => ({
    label,
    registry: CHILD_REGISTRY,
    isCanonical: true,
    canSetParent: true,
    ...overrides,
  })

  it('re-parents the children it can move after the switch, and reports the rest', () => {
    const blocked = child('blocked', { canSetParent: false })
    const { finalCalls, unmovedChildren } = plan(makeState(), {
      children: [
        child('alice'),
        blocked,
        child('moved', { isCanonical: false }),
      ],
    })._unsafeUnwrap()

    expect(
      finalCalls.map((c) => [
        c.to,
        decode(c.data).functionName,
        decode(c.data).args,
      ]),
    ).toEqual([
      [PARENT_REGISTRY, 'setSubregistry', [42n, REPLACEMENT]],
      [CHILD_REGISTRY, 'setParent', [REPLACEMENT, 'alice']],
    ])
    expect(unmovedChildren).toEqual([blocked])
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

describe('splitRepairNames', () => {
  it('keeps owned, unexpired names and lists the expired or unregistered ones', () => {
    const live = makeName({ label: 'live', expiry: 101n })
    const { names, expiredLabels } = splitRepairNames(
      [
        live,
        makeName({ label: 'expired', expiry: 100n }),
        makeName({ label: 'unregistered', owner: zeroAddress, expiry: 50n }),
        makeName({ label: 'never', owner: zeroAddress, expiry: 0n }),
      ],
      100n,
    )

    expect(names).toEqual([live])
    expect(expiredLabels).toEqual(['expired', 'unregistered'])
  })
})

describe('toRegistryChildren', () => {
  const OTHER = getAddress('0x00000000000000000000000000000000000006ff')

  it('marks a child canonical only while it names this registry and label as its parent', () => {
    const names = [
      makeName({ label: 'a', subregistry: CHILD_REGISTRY }),
      makeName({ label: 'none' }),
      makeName({ label: 'b', subregistry: OTHER }),
      makeName({ label: 'c', subregistry: OTHER }),
      makeName({ label: 'd', subregistry: OTHER }),
    ]

    const children = toRegistryChildren({
      registry: REPLACEMENT,
      names,
      parents: [
        [REPLACEMENT, 'a'],
        [REPLACEMENT, 'other-label'],
        [PARENT_REGISTRY, 'c'],
        null,
      ],
      canSetParent: [true, false, true, false],
    })

    expect(
      children.map((c) => [c.label, c.isCanonical, c.canSetParent]),
    ).toEqual([
      ['a', true, true],
      ['b', false, false],
      ['c', false, true],
      ['d', false, false],
    ])
  })
})
