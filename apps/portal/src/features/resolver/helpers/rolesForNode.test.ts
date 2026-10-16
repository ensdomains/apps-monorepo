import { describe, expect, it } from 'vitest'
import type { ResolverRole } from '../hooks/useResolverOverview'
import { rolesForNode } from './rolesForNode'

const role = (overrides: Partial<ResolverRole>): ResolverRole => ({
  account: '0x1111111111111111111111111111111111111111',
  resource: '1',
  roleBitmap: '1',
  blockNumber: 1,
  transactionHash: null,
  timestamp: null,
  name: null,
  ...overrides,
})

describe('rolesForNode', () => {
  it('keeps the grants scoped to the node, whatever their resource', () => {
    const scoped = role({ name: 'Alice.eth', resource: '123' })
    const other = role({ name: 'bob.eth' })
    const unscoped = role({ name: null, resource: null })

    expect(
      rolesForNode([scoped, other, unscoped], { name: 'alice.eth' }),
    ).toEqual([scoped])
  })
})
