import { describe, expect, it } from 'vitest'
import { checkText } from '../src/text.ts'

const rulesOn = (text: string): ReadonlyArray<string> =>
  checkText('a.ts', text).map((d) => `${d.line} ${d.rule}`)

describe('checkText', () => {
  it('flags a suppressed accessibility rule', () => {
    expect(
      rulesOn(
        [
          '// biome-ignore lint/a11y/useButtonType: legacy button',
          '// biome-ignore lint/style/noNestedTernary: generated table',
        ].join('\n'),
      ),
    ).toEqual(['1 text/no-a11y-suppression'])
  })

  it('flags an eslint-disable without a reason, in each form', () => {
    expect(
      rulesOn(
        [
          '// eslint-disable-next-line functional/no-let',
          'let x = 1 // eslint-disable-line functional/no-let',
          '/* eslint-disable functional/immutable-data */',
          '// eslint-disable-next-line functional/no-let -- the loop index is reassigned',
          '/* eslint-enable functional/immutable-data */',
        ].join('\n'),
      ),
    ).toEqual([
      '1 text/eslint-disable-reason',
      '2 text/eslint-disable-reason',
      '3 text/eslint-disable-reason',
    ])
  })

  it('ignores the same words inside a string', () => {
    expect(
      rulesOn(
        [
          "const example = '// eslint-disable-next-line functional/no-let'",
          'const other = "// biome-ignore lint/a11y/useButtonType: x"',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('leaves ordinary lines alone', () => {
    expect(rulesOn('export const a = 1\n// a comment -- with dashes')).toEqual(
      [],
    )
  })
})
