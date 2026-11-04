import { cpSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBiome } from '../src/biome.ts'
import { biomeBin, fixturesDir } from '../src/paths.ts'
import { runtimeBiomeConfig } from '../src/runtimeConfig.ts'

const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))

const MARKER = /expect: ([\w@/-]+)/gu

/** Every `expect: <rule>` marker, as `rule path:line`. */
const markers = (
  root: string,
  files: ReadonlyArray<string>,
): ReadonlyArray<{ readonly rule: string; readonly at: string }> =>
  files.flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .flatMap((line, i) =>
        [...line.matchAll(MARKER)].map(([, rule = '']) => ({
          rule,
          at: `${file}:${i + 1}`,
        })),
      ),
  )

/** A marker names a plugin by its id, or a stock rule by its full category. */
const reportedAs = (rule: string): string =>
  rule.startsWith('lint/') ? rule : `plugin/${rule}`

// Each folder under fixtures/ exercises the rules its markers name: a plugin
// folder is named after its plugin, and _stock holds stock Biome rules whose
// options agent-lint sets. Every rule a folder names must report on exactly
// the marked lines. The fixtures are copied out first: the agent config skips
// the fixtures folder so real runs never lint its deliberate violations.
describe.each(readdirSync(fixturesDir))('fixtures/%s', (folder) => {
  it('reports exactly the marked lines', () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-lint-fixture-'))
    cpSync(join(fixturesDir, folder), join(root, folder), { recursive: true })
    const files = filesUnder(root)
    const run = runBiome({
      biome: biomeBin,
      config: runtimeBiomeConfig(),
      cwd: root,
      files,
    })
    expect(run.errors).toEqual([])
    const marked = markers(root, files)
    const rules = new Set([
      ...(folder.startsWith('_') ? [] : [reportedAs(folder)]),
      ...marked.map((m) => reportedAs(m.rule)),
    ])
    const reported = run.diagnostics
      .filter((d) => rules.has(d.rule))
      .map((d) => `${d.rule} ${d.path}:${d.line}`)
    const expected = marked.map((m) => `${reportedAs(m.rule)} ${m.at}`)
    expect([...reported].sort()).toEqual([...expected].sort())
  })
})
