import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  CHILD_REGISTRY,
  makeName,
  PARENT_REGISTRY,
  REPLACEMENT,
} from './registryRepair.testUtils'
import { toRegistryChildren } from './registryRepairChildren'

const OLD_REGISTRY = getAddress('0x00000000000000000000000000000000000007aa')
const ABANDONED = getAddress('0x00000000000000000000000000000000000008bb')

describe('toRegistryChildren', () => {
  const entry = (
    label: string,
    parent: readonly [`0x${string}`, string] | null,
    canSetParent = true,
  ) => ({
    name: makeName({ label, subregistry: CHILD_REGISTRY }),
    parent,
    canSetParent,
  })

  it.each([
    ['a child of the old registry', entry('a', [OLD_REGISTRY, 'a']), 'move'],
    [
      'a child an abandoned attempt already took',
      entry('a', [ABANDONED, 'a']),
      'move',
    ],
    [
      'a child the account cannot re-parent',
      entry('a', [OLD_REGISTRY, 'a'], false),
      'leave',
    ],
    ['a child whose parent could not be read', entry('a', null), 'leave'],
    ['a child under another label', entry('a', [OLD_REGISTRY, 'b']), 'skip'],
    [
      'a child already on the current replacement',
      entry('a', [REPLACEMENT, 'a']),
      'skip',
    ],
    ['a child of another registry', entry('a', [PARENT_REGISTRY, 'a']), 'skip'],
  ] as const)('%s: %s', (_case, child, action) => {
    const [result] = toRegistryChildren({
      fromRegistries: [OLD_REGISTRY, ABANDONED],
      entries: [child],
    })

    expect(result?.action).toBe(action)
  })
})
