import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import {
  eacGrantRolesSnippet,
  eacRevokeRootRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryUnregisterSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  userRegistryInitializeSnippet,
  userRegistryRegisterSnippet,
  userRegistrySetParentSnippet,
  userRegistrySetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/userRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { decodeFunctionData, type Hex, labelhash, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { planRegistryRepair } from './registryRepair'
import {
  ALICE,
  ALL,
  BOB,
  CHILD_REGISTRY,
  CONTROLLER,
  FACTORY,
  HCA,
  IMPLEMENTATION,
  makeName,
  makeState,
  PARENT_REGISTRY,
  REGISTRAR_AND_PARENT,
  REPLACEMENT,
  RESOLVER,
  SOME,
} from './registryRepair.testUtils'
import type { RegistryChild } from './registryRepairChildren'
import type { RegistryRepairState } from './registryRepairState'

const SALT = 7n

const plan = (
  state: RegistryRepairState,
  {
    existing = null,
    children = [],
    account = CONTROLLER,
  }: {
    readonly existing?: RegistryRepairState | null
    readonly children?: readonly RegistryChild[]
    readonly account?: typeof CONTROLLER
  } = {},
) =>
  planRegistryRepair({
    state,
    existing,
    children,
    account,
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
  ...permissionedRegistryUnregisterSnippet,
  ...eacRevokeRootRolesSnippet,
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

  it('refuses a registry with no root roles', () => {
    const state = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: 0n }],
    })

    expect(plan(state)._unsafeUnwrapErr().reason).toBe('no-root-roles')
  })

  it.each([
    [
      'no set-parent role',
      CONTROLLER,
      makeState({
        rootRoles: [
          { account: CONTROLLER, roleBitmap: registryRoles.ROLE_REGISTRAR },
        ],
      }),
    ],
    [
      'no registrar role',
      CONTROLLER,
      makeState({
        rootRoles: [
          { account: CONTROLLER, roleBitmap: registryRoles.ROLE_SET_PARENT },
        ],
      }),
    ],
  ] as const)(
    'refuses an account with %s on the registry',
    (_case, account, state) => {
      expect(plan(state, { account })._unsafeUnwrapErr().reason).toBe(
        'missing-root-roles',
      )
    },
  )

  describe('an account without root roles on the registry', () => {
    const ADMINS = makeState().rootRoles

    it("deploys the replacement with the original's admins and the account holding their roles", () => {
      const [deploy] = plan(makeState(), { account: ALICE })._unsafeUnwrap()
        .copyCalls
      const initialize = decode(deploy?.data ?? '0x').args?.[2] as Hex

      expect(
        decodeFunctionData({
          abi: userRegistryInitializeSnippet,
          data: initialize,
        }).args,
      ).toEqual([[...ADMINS, { account: ALICE, roleBitmap: ALL }]])
    })

    it('resumes a copy it started without reading its own admin roles as a divergence', () => {
      const existing = makeState({
        rootRoles: [...ADMINS, { account: ALICE, roleBitmap: ALL }],
      })

      expect(
        plan(makeState(), { account: ALICE, existing })._unsafeUnwrap()
          .copyCalls,
      ).toEqual([])
    })
  })

  describe('Case B: an account without root roles, with subnames others own', () => {
    const ADMINS = makeState().rootRoles
    const finalSteps = (existing: RegistryRepairState | null = null) =>
      plan(makeState(), { account: BOB, existing })
        ._unsafeUnwrap()
        .finalCalls.map((c) => decode(c.data))

    it('gives its temporary root roles back after the copy, before the switch', () => {
      const [revoke, switchParent] = finalSteps()

      expect(revoke?.functionName).toBe('revokeRootRoles')
      expect(revoke?.args).toEqual([ALL, BOB])
      expect(switchParent?.functionName).toBe('setSubregistry')
    })

    it('keeps them when it owns every subname (Case A)', () => {
      const finalCalls = plan(makeState(), { account: ALICE })._unsafeUnwrap()
        .finalCalls

      expect(finalCalls.map((c) => decode(c.data).functionName)).toEqual([
        'setSubregistry',
      ])
    })

    it('still gives them back when a resume finds them on the copy', () => {
      const existing = makeState({
        rootRoles: [...ADMINS, { account: BOB, roleBitmap: ALL }],
      })

      expect(finalSteps(existing).map((step) => step.functionName)).toEqual([
        'revokeRootRoles',
        'setSubregistry',
      ])
    })

    it('only switches when a stop came after giving them back', () => {
      expect(finalSteps(makeState()).map((step) => step.functionName)).toEqual([
        'setSubregistry',
      ])
    })

    it('starts a fresh copy when the roles are gone but the copy is not whole', () => {
      const existing = makeState({ names: [] })

      expect(
        plan(makeState(), { account: BOB, existing })._unsafeUnwrapErr().reason,
      ).toBe('replacement-diverged')
    })
  })

  it('refuses to grant admin roles to anyone but the owner, which only `register` can do', () => {
    const state = makeState({
      names: [
        makeName({
          roles: [
            { account: ALICE, roleBitmap: ALL },
            { account: BOB, roleBitmap: SOME << 128n },
          ],
        }),
      ],
    })

    expect(plan(state)._unsafeUnwrapErr().reason).toBe('cannot-grant')
  })

  it("refuses a name whose roles the account can't grant", () => {
    const state = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: REGISTRAR_AND_PARENT }],
      names: [
        makeName({
          roles: [
            { account: ALICE, roleBitmap: ALL },
            { account: BOB, roleBitmap: SOME },
          ],
        }),
      ],
    })

    expect(plan(state)._unsafeUnwrapErr()).toMatchObject({
      reason: 'cannot-grant',
      label: 'alice',
    })
  })

  it("doesn't count name roles the sender only gets on a name it doesn't own", () => {
    const state = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: REGISTRAR_AND_PARENT }],
      names: [
        makeName({
          roles: [
            { account: ALICE, roleBitmap: ALL },
            { account: CONTROLLER, roleBitmap: SOME << 128n },
            { account: BOB, roleBitmap: SOME },
          ],
        }),
      ],
    })

    expect(plan(state)._unsafeUnwrapErr().reason).toBe('cannot-grant')
  })

  it('lets an admin role grant the regular role it implies', () => {
    const state = makeState({
      rootRoles: [
        {
          account: CONTROLLER,
          roleBitmap: REGISTRAR_AND_PARENT | (SOME << 128n),
        },
      ],
      names: [
        makeName({
          roles: [
            { account: ALICE, roleBitmap: ALL },
            { account: BOB, roleBitmap: SOME },
          ],
        }),
      ],
    })

    expect(plan(state).isOk()).toBe(true)
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

  it('unregisters a name the original lost since the copy, so it does not come back', () => {
    const existing = makeState({ names: [makeName(), BOB_NAME] })
    const [unregister] = plan(makeState(), { existing })._unsafeUnwrap()
      .copyCalls

    expect(unregister && decode(unregister.data)).toMatchObject({
      functionName: 'unregister',
      args: [BigInt(labelhash('bob'))],
    })
  })

  it('refuses to resume when it could not unregister such a name', () => {
    const state = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: REGISTRAR_AND_PARENT }],
    })
    const existing = makeState({
      rootRoles: [{ account: CONTROLLER, roleBitmap: REGISTRAR_AND_PARENT }],
      names: [makeName(), BOB_NAME],
    })

    expect(plan(state, { existing })._unsafeUnwrapErr()).toMatchObject({
      reason: 'replacement-diverged',
      label: 'bob',
    })
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
    action: RegistryChild['action'],
  ): RegistryChild => ({ label, registry: CHILD_REGISTRY, action })

  it('re-parents the children it can move before the switch, and reports the ones left behind', () => {
    const blocked = child('blocked', 'leave')
    const { finalCalls, unmovedChildren } = plan(makeState(), {
      children: [child('alice', 'move'), blocked, child('moved', 'skip')],
    })._unsafeUnwrap()

    expect(
      finalCalls.map((c) => [
        c.to,
        decode(c.data).functionName,
        decode(c.data).args,
      ]),
    ).toEqual([
      [CHILD_REGISTRY, 'setParent', [REPLACEMENT, 'alice']],
      [PARENT_REGISTRY, 'setSubregistry', [42n, REPLACEMENT]],
    ])
    expect(unmovedChildren).toEqual([blocked])
  })
})
