import { describe, expect, it } from 'vitest'
import { parseBiomeReport } from '../src/biome.ts'

const report = (diagnostics: ReadonlyArray<unknown>): string =>
  JSON.stringify({ diagnostics })

describe('parseBiomeReport', () => {
  it('names a plugin finding by its plugin id and keeps the rest of the message', () => {
    const run = parseBiomeReport(
      report([
        {
          category: 'plugin',
          message: '[no-emoji] No emojis in log messages.',
          location: { path: 'a.tsx', start: { line: 3 }, end: { line: 4 } },
        },
      ]),
    )
    expect(run.diagnostics).toEqual([
      {
        tool: 'biome',
        rule: 'plugin/no-emoji',
        path: 'a.tsx',
        line: 3,
        endLine: 4,
        message: 'No emojis in log messages.',
      },
    ])
  })

  it('puts a whole-file finding, reported at line 0, on line 1', () => {
    const run = parseBiomeReport(
      report([
        {
          category: 'lint/style/useFilenamingConvention',
          message: 'Rename the file.',
          location: { path: 'bad-name.ts', start: { line: 0 } },
        },
      ]),
    )
    expect(run.diagnostics.map((d) => [d.line, d.endLine])).toEqual([[1, 1]])
  })

  it('keeps a syntax error as a finding', () => {
    const run = parseBiomeReport(
      report([
        {
          category: 'parse',
          message: 'expected an expression',
          location: { path: 'a.ts', start: { line: 7 } },
        },
      ]),
    )
    expect(run.diagnostics.map((d) => `${d.rule} ${d.line}`)).toEqual([
      'parse 7',
    ])
  })

  it('reports a diagnostic with no file as a tool error', () => {
    const run = parseBiomeReport(
      report([{ category: 'configuration', message: 'bad config' }]),
    )
    expect(run).toEqual({
      diagnostics: [],
      errors: ['configuration: bad config'],
    })
  })
})
