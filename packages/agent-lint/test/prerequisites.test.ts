import { describe, expect, it } from 'vitest'
import { withPrerequisites } from '../src/prerequisites.ts'
import type { Diagnostic } from '../src/types.ts'

const at = (rule: string, path: string): Diagnostic => ({
  tool: 'biome',
  rule,
  path,
  line: 1,
  endLine: 1,
  message: '',
})

const INVARIANT = 'packages/utils/src/invariant.ts'

describe('withPrerequisites', () => {
  it('keeps no-throw where packages/utils has invariant', () => {
    const d = at('agent/no-throw', 'apps/portal/src/features/Banner.tsx')
    expect(withPrerequisites([d], (path) => path === INVARIANT)).toEqual([d])
  })

  it('drops no-throw in a checkout without invariant', () => {
    const d = at('agent/no-throw', 'apps/portal/src/features/Banner.tsx')
    const otherUtilsFile = (path: string): boolean =>
      path === 'packages/utils/src/index.ts'
    expect(withPrerequisites([d], otherUtilsFile)).toEqual([])
  })

  it('leaves every other rule alone', () => {
    const d = at(
      'lint/style/noNestedTernary',
      'apps/portal/src/features/Banner.tsx',
    )
    expect(withPrerequisites([d], () => false)).toEqual([d])
  })
})
