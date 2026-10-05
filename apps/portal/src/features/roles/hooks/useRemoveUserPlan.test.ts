// @vitest-environment happy-dom
import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { renderHook } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OWNER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CALLER: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const MANAGER: Address = '0xcccccccccccccccccccccccccccccccccccccccc'

/** What the registrar grants a fresh `.eth` 2LD owner. */
const OWNER_ROLES: Role[] = [
  'ROLE_CAN_TRANSFER_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_SET_SUBREGISTRY',
  'ROLE_SET_SUBREGISTRY_ADMIN',
]

const callerRolesQuery: {
  data: { decoded: Role[]; raw: bigint } | undefined
  enabled?: boolean
} = { data: undefined }

const rootHoldersQuery: {
  data: { account: Address; roles: Role[] }[] | undefined
  isSuccess: boolean
} = { data: undefined, isSuccess: false }

const queryOptionsSeen: Record<string, unknown>[] = []

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: {
      queryKey: readonly unknown[]
      enabled?: boolean
    }) => {
      const key = options.queryKey[0]
      if (key === 'getNameRolesForAccount') {
        queryOptionsSeen.push(options.queryKey[1] as Record<string, unknown>)
        return options.enabled === false
          ? { data: undefined }
          : { data: callerRolesQuery.data }
      }
      if (key === 'get-registry-root-role-holders') return rootHoldersQuery
      return { data: undefined, isSuccess: false }
    },
  }
})

const { useRemoveUserPlan } = await import('./useRemoveUserPlan')

const holders = (rows: [Address, Role[]][]): GetNameRolesAccountsReturnType =>
  new Map(rows)

type PlanParameters = Parameters<typeof useRemoveUserPlan>[0]

// Spread rather than destructuring defaults, so an explicit `undefined`
// (no wallet) overrides the default caller instead of falling back to it.
const renderPlan = (overrides: Partial<PlanParameters> = {}) =>
  renderHook(() =>
    useRemoveUserPlan({
      name: 'vault.eth',
      registryAddress: REGISTRY,
      account: OWNER,
      currentRoles: OWNER_ROLES,
      roleHolders: holders([[OWNER, OWNER_ROLES]]),
      ownerAddress: OWNER,
      callerAddress: OWNER,
      ...overrides,
    }),
  ).result.current

describe('useRemoveUserPlan', () => {
  beforeEach(() => {
    callerRolesQuery.data = { decoded: OWNER_ROLES, raw: 0n }
    rootHoldersQuery.data = []
    rootHoldersQuery.isSuccess = true
    queryOptionsSeen.length = 0
  })

  it("never revokes the transfer role from the owner's own row", () => {
    const plan = renderPlan()

    expect(plan.rolesToRevoke).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
    expect(plan.frozenRoles).toEqual(['ROLE_CAN_TRANSFER_ADMIN'])
    expect(plan.rolesToRevoke).toEqual([
      'ROLE_SET_RESOLVER',
      'ROLE_SET_RESOLVER_ADMIN',
      'ROLE_SET_SUBREGISTRY',
      'ROLE_SET_SUBREGISTRY_ADMIN',
    ])
  })

  it('reads the caller by normalised label, so a mixed-case route still finds its roles', () => {
    renderPlan({ name: 'Vault.eth' })

    expect(queryOptionsSeen.at(-1)).toMatchObject({
      registryAddress: REGISTRY,
      label: 'vault',
      account: OWNER,
    })
  })

  it('counts admin roles the caller holds only at the registry root', () => {
    // The caller holds nothing on the name itself; root authority alone has
    // to make the manager's role revocable.
    callerRolesQuery.data = { decoded: [], raw: 0n }
    rootHoldersQuery.data = [
      { account: CALLER, roles: ['ROLE_SET_RESOLVER_ADMIN'] },
    ]

    const plan = renderPlan({
      account: MANAGER,
      currentRoles: ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'],
      roleHolders: holders([
        [OWNER, OWNER_ROLES],
        [MANAGER, ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY']],
      ]),
      callerAddress: CALLER,
    })

    expect(plan.rolesToRevoke).toEqual(['ROLE_SET_RESOLVER'])
    expect(plan.unauthorizedRoles).toEqual(['ROLE_SET_SUBREGISTRY'])
  })

  it("doesn't report a lockout for an admin role a root holder can grant back", () => {
    rootHoldersQuery.data = [
      { account: MANAGER, roles: ['ROLE_SET_RESOLVER_ADMIN'] },
    ]

    const plan = renderPlan()

    expect(plan.lockoutRoles).toEqual(['ROLE_SET_SUBREGISTRY_ADMIN'])
    expect(plan.isRootAuthorityUnknown).toBe(false)
  })

  it('treats unread root holders as unknown, not empty', () => {
    rootHoldersQuery.data = undefined
    rootHoldersQuery.isSuccess = false

    const plan = renderPlan()

    expect(plan.isRootAuthorityUnknown).toBe(true)
    expect(plan.lockoutRoles).toEqual([
      'ROLE_SET_RESOLVER_ADMIN',
      'ROLE_SET_SUBREGISTRY_ADMIN',
    ])
  })

  it('revokes nothing when the label cannot be normalised', () => {
    const plan = renderPlan({ name: 'va\u0000ult.eth' })

    expect(plan.rolesToRevoke).toEqual([])
    expect(plan.unauthorizedRoles).not.toContain('ROLE_CAN_TRANSFER_ADMIN')
  })

  it('revokes nothing with no wallet connected', () => {
    const plan = renderPlan({ callerAddress: undefined })

    expect(plan.rolesToRevoke).toEqual([])
  })
})
