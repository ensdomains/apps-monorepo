import { describe, expect, it } from 'vitest'
import type {
  ResolverOverview,
  ResolverRole,
} from '../hooks/useResolverOverview'
import { toNodeRolesStatus } from './nodeRolesStatus'

const role = (overrides: Partial<ResolverRole>): ResolverRole => ({
  account: '0x1111111111111111111111111111111111111111',
  resource: '1',
  roleBitmap: '1',
  blockNumber: 1,
  transactionHash: null,
  timestamp: null,
  name: 'alice.eth',
  ...overrides,
})

const overview = (roles: readonly ResolverRole[]) => ({
  isError: false,
  data: { rolesStatus: 'full', roles } as unknown as ResolverOverview,
})

describe('toNodeRolesStatus', () => {
  it('stays full when the only unnamed grant is resolver-wide', () => {
    const roles = [role({}), role({ name: null, resource: '0' })]

    expect(toNodeRolesStatus(overview(roles), roles)).toBe('full')
  })

  it('is partial when a scoped grant has no name to match', () => {
    const roles = [role({ name: null, resource: '123' })]

    expect(toNodeRolesStatus(overview(roles), roles)).toBe('partial')
  })

  it('is partial when a grant has neither a name nor a resource', () => {
    const roles = [role({ name: null, resource: null })]

    expect(toNodeRolesStatus(overview(roles), roles)).toBe('partial')
  })

  it('reports loading and error before the overview arrives', () => {
    expect(toNodeRolesStatus({ isError: false, data: undefined }, [])).toBe(
      'loading',
    )
    expect(toNodeRolesStatus({ isError: true }, [])).toBe('error')
  })
})
