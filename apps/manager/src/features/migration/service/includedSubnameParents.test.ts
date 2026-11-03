import { describe, expect, it } from 'vitest'
import { makeClassified } from './_fixtures'
import type { ClassifiedName } from './classifyNames'
import { getIncludedSubnameParents } from './includedSubnameParents'

const child = (name: string, recreationRoot?: string): ClassifiedName => ({
  ...makeClassified({ action: 'copy', name, id: name }),
  recreationRoot,
})

describe('getIncludedSubnameParents', () => {
  it('counts the recreated direct subnames under each parent, by name', () => {
    expect(
      getIncludedSubnameParents([
        makeClassified({ name: 'zeta.eth' }),
        child('a.zeta.eth', 'zeta.eth'),
        makeClassified({ name: 'alpha.eth' }),
        child('b.zeta.eth', 'zeta.eth'),
        child('a.alpha.eth', 'alpha.eth'),
      ]),
    ).toEqual([
      { name: 'alpha.eth', subnameCount: 1 },
      { name: 'zeta.eth', subnameCount: 2 },
    ])
  })

  it('ignores copies that are not subname imports', () => {
    expect(
      getIncludedSubnameParents([
        makeClassified({ name: 'wrapped.eth' }),
        child('sub.wrapped.eth'),
      ]),
    ).toEqual([])
  })
})
