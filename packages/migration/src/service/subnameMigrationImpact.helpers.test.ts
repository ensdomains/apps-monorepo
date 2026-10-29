import type { Meta } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { canSkipEmptySubtree } from './subnameMigrationImpact.helpers'

const meta: Meta = {
  as_of: {
    '1': {
      block_number: 123,
      block_hash: `0x${'ab'.repeat(32)}`,
      timestamp: '1800000000',
    },
  },
}
const run = (
  overrides: Partial<Parameters<typeof canSkipEmptySubtree>[0]> = {},
) =>
  canSkipEmptySubtree({
    shouldSkipEmptySubtrees: true,
    name: 'parent.eth',
    count: 0,
    meta,
    chainId: 1,
    selectedNames: ['parent.eth'],
    ...overrides,
  })

describe('canSkipEmptySubtree', () => {
  it('accepts only explicit zero backed by the complete root publication', () => {
    expect(run()).toBe(true)
  })

  it.each([
    { shouldSkipEmptySubtrees: false },
    { count: undefined },
    { count: 1 },
    { count: -1 },
    { selectedNames: ['parent.eth', 'CHILD.parent.eth'] },
    { meta: {} },
    { meta: { ...meta, completeness: 'partial' as const } },
    {
      meta: {
        ...meta,
        as_of_completeness: {
          '1': { completeness: 'partial' as const, unsupported_reason: 'gap' },
        },
      },
    },
    { meta: { ...meta, unsupported_fields: ['subname_count'] } },
    { chainId: 2 },
  ])(
    'retains the full inventory read when zero is not sufficient: %j',
    (overrides) => {
      expect(run(overrides)).toBe(false)
    },
  )
})
