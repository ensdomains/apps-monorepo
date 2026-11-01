import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { type ParsedConfig, splitByTsconfig } from '../src/tsconfigCoverage.ts'

/** Writes a small repository to a scratch folder and returns its root. */
const repo = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'agent-lint-coverage-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const config = (value: object): string => JSON.stringify(value)

describe('splitByTsconfig', () => {
  it('covers a file the include list reaches and leaves out one it does not', () => {
    const root = repo({
      'pkg/tsconfig.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/vitest.config.ts': 'export default {}',
    })
    expect(
      splitByTsconfig(root, ['pkg/src/a.ts', 'pkg/vitest.config.ts']),
    ).toEqual({
      covered: ['pkg/src/a.ts'],
      uncovered: ['pkg/vitest.config.ts'],
    })
  })

  it('leaves out a file the exclude list removes, such as a test', () => {
    const root = repo({
      'pkg/tsconfig.json': config({
        include: ['src/**/*'],
        exclude: ['**/*.test.ts'],
      }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/src/a.test.ts': 'export const t = 1',
    })
    expect(
      splitByTsconfig(root, ['pkg/src/a.ts', 'pkg/src/a.test.ts']),
    ).toEqual({
      covered: ['pkg/src/a.ts'],
      uncovered: ['pkg/src/a.test.ts'],
    })
  })

  it('leaves out a file with no tsconfig.json at or above its folder', () => {
    const root = repo({
      'pkg/tsconfig.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
      'scripts/loose.ts': 'export const loose = 1',
    })
    expect(splitByTsconfig(root, ['pkg/src/a.ts', 'scripts/loose.ts'])).toEqual(
      {
        covered: ['pkg/src/a.ts'],
        uncovered: ['scripts/loose.ts'],
      },
    )
  })

  it('covers a file that only a tsconfig above the nearest one lists', () => {
    const root = repo({
      'tsconfig.json': config({ include: ['pkg/other.ts'] }),
      'pkg/tsconfig.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/other.ts': 'export const other = 1',
    })
    expect(splitByTsconfig(root, ['pkg/src/a.ts', 'pkg/other.ts'])).toEqual({
      covered: ['pkg/src/a.ts', 'pkg/other.ts'],
      uncovered: [],
    })
  })

  it('covers a file outside every include list that a listed file imports', () => {
    const root = repo({
      'pkg/tsconfig.json': config({
        include: ['src'],
        compilerOptions: { module: 'ESNext', moduleResolution: 'bundler' },
      }),
      'pkg/src/a.ts':
        "import { shared } from '../shared'\nexport const a = shared",
      'pkg/shared.ts': 'export const shared = 1',
      'pkg/unused.ts': 'export const unused = 1',
    })
    expect(splitByTsconfig(root, ['pkg/shared.ts', 'pkg/unused.ts'])).toEqual({
      covered: ['pkg/shared.ts'],
      uncovered: ['pkg/unused.ts'],
    })
  })

  it('reads the include list a tsconfig inherits with extends', () => {
    const root = repo({
      'pkg/base.json': config({ include: ['src'] }),
      'pkg/tsconfig.json': config({ extends: './base.json' }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/vite.config.ts': 'export default {}',
    })
    expect(
      splitByTsconfig(root, ['pkg/src/a.ts', 'pkg/vite.config.ts']),
    ).toEqual({
      covered: ['pkg/src/a.ts'],
      uncovered: ['pkg/vite.config.ts'],
    })
  })

  it('follows the references of a solution tsconfig', () => {
    const root = repo({
      'pkg/tsconfig.json': config({
        files: [],
        references: [{ path: './tsconfig.app.json' }],
      }),
      'pkg/tsconfig.app.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/vite.config.ts': 'export default {}',
    })
    expect(
      splitByTsconfig(root, ['pkg/src/a.ts', 'pkg/vite.config.ts']),
    ).toEqual({
      covered: ['pkg/src/a.ts'],
      uncovered: ['pkg/vite.config.ts'],
    })
  })

  it('treats the files under a tsconfig that does not parse as uncovered', () => {
    const root = repo({
      'pkg/tsconfig.json': '{ "include": [',
      'pkg/src/a.ts': 'export const a = 1',
    })
    expect(splitByTsconfig(root, ['pkg/src/a.ts'])).toEqual({
      covered: [],
      uncovered: ['pkg/src/a.ts'],
    })
  })

  it('builds no program when every file is named by an include list', () => {
    const root = repo({
      'pkg/tsconfig.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
    })
    const programFilesOf = vi.fn((_config: ParsedConfig) => new Set<string>())
    splitByTsconfig(root, ['pkg/src/a.ts'], programFilesOf)
    expect(programFilesOf).not.toHaveBeenCalled()
  })

  it('builds one program for each config above a file no include list names', () => {
    const root = repo({
      'tsconfig.json': config({ include: ['pkg/src'] }),
      'pkg/tsconfig.json': config({ include: ['src'] }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/vite.config.ts': 'export default {}',
      'pkg/vitest.config.ts': 'export default {}',
    })
    const programFilesOf = vi.fn((_config: ParsedConfig) => new Set<string>())
    splitByTsconfig(
      root,
      ['pkg/src/a.ts', 'pkg/vite.config.ts', 'pkg/vitest.config.ts'],
      programFilesOf,
    )
    expect(
      programFilesOf.mock.calls.map(([built]) => relative(root, built.path)),
    ).toEqual(['pkg/tsconfig.json', 'tsconfig.json'])
  })

  it('splits any selection of files without losing, adding or reordering one', () => {
    const root = repo({
      'pkg/tsconfig.json': config({
        include: ['src'],
        exclude: ['**/*.test.ts'],
      }),
      'pkg/src/a.ts': 'export const a = 1',
      'pkg/src/b.tsx': 'export const b = 1',
      'pkg/src/a.test.ts': 'export const t = 1',
      'pkg/vitest.config.ts': 'export default {}',
      'loose.ts': 'export const loose = 1',
    })
    const pool = [
      'pkg/src/a.ts',
      'pkg/src/b.tsx',
      'pkg/src/a.test.ts',
      'pkg/vitest.config.ts',
      'loose.ts',
    ]
    const listed: ReadonlySet<string> = new Set([
      'pkg/src/a.ts',
      'pkg/src/b.tsx',
    ])
    fc.assert(
      fc.property(fc.shuffledSubarray(pool), (files) => {
        const { covered, uncovered } = splitByTsconfig(root, files)
        expect(covered).toEqual(files.filter((f) => listed.has(f)))
        expect(uncovered).toEqual(files.filter((f) => !listed.has(f)))
      }),
      { numRuns: 25 },
    )
  })
})
