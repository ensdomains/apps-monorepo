/**
 * Generate the V1 matrix specs.
 *
 *     pnpm --filter @ens-apps/e2e matrix:generate
 *     pnpm --filter @ens-apps/e2e matrix:generate --check   # CI staleness gate
 *
 * **Why generated files rather than a loop in a spec.** `coverage/reconcile.ts`
 * finds scenarios by scanning spec *text* for `@scenario:<id>`. A loop emitting
 * `` tag: [`@scenario:${id}`] `` yields tests that run and pass while the
 * ledger counts them as not-started — 350 confident green tests worth zero
 * coverage, which is the same class of lie as a spec no config runs. So the
 * tags have to be literal in committed files, and a `--check` run in CI keeps
 * them honest.
 *
 * One file per shape group, because `fullyParallel: false` shards by file.
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  depthOf,
  SHAPES,
  type Shape,
  type ShapeId,
} from '@ens-apps/v1-name-shapes'
import { expectationFor } from '../matrix/expectations.js'
import { cellsFor, scenarioIdFor } from '../matrix/ids.js'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(here, '..', 'projects', 'portal', 'matrix')

/** Which file a shape's tests live in. Clock movers are quarantined. */
const groupOf = (shape: Shape): string => {
  if (shape.registration !== 'active') return 'time'
  return `${depthOf(shape)}ld`
}

const header = (group: string) => `/**
 * GENERATED FILE — do not edit.
 *
 * Written by \`e2e/scripts/generate-v1-matrix.ts\` from the shape table in
 * \`@ens-apps/v1-name-shapes\` and the expectations in
 * \`e2e/matrix/expectations.ts\`. Change those and regenerate:
 *
 *     pnpm --filter @ens-apps/e2e matrix:generate
 *
 * Each test is one cell of the V1 shape matrix: one portal tab, for one way a
 * V1 name can be held. The shape is seeded once per \`describe\`; the tabs
 * below it only read.${
   group === 'time'
     ? `
 *
 * This file moves the fork clock forward and can never be undone, so it runs
 * in its own project and sorts last. Nothing here may use \`withChainSnapshot\`:
 * an \`evm_revert\` rewinds the chain but not Panoptes, which then halts
 * permanently.`
     : ''
}
 */

import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { type SeededShape, runCell, seedForSuite } from '../../../matrix/run.js'
`

const testBlock = (shape: Shape): string => {
  const cells = cellsFor(shape)
    .map((tab) => ({
      tab,
      // `Shape.id` is widened to `string` on the iterable view of the table;
      // the literal union only survives on the source list.
      expectation: expectationFor(shape.id as ShapeId, tab.id),
    }))
    .filter((cell) => cell.expectation && !cell.expectation.todo)
  if (cells.length === 0) return ''

  const body = cells
    .map(({ tab, expectation }) => {
      const id = scenarioIdFor(tab, shape)
      const fail = expectation?.defect
        ? `\n    test.fail(true, '${expectation.defect.id}: ${expectation.defect.actual.replace(/'/g, "\\'")}')\n`
        : ''
      // The title MUST stay on the same line as `test(`. reconcile.ts finds
      // tests with /^\s*test\s*\(\s*['"`]/ — a title on the following line is
      // not a test as far as the ledger is concerned, so the tags below it are
      // never attributed and the cells read "no covering test" while passing.
      // Measured: regenerating without a formatter pass dropped 6 terminal rows.
      return `  test('${tab.id} · ${expectation?.title.replace(/'/g, "\\'")}', {
    tag: ['@scenario:${id}', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {${fail}
    await runCell(page, wallet, seeded, '${tab.id}')
  })`
    })
    .join('\n\n')

  return `test.describe('V1 shape · ${shape.id}', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('${shape.id}')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

${body}
})
`
}

const groups = new Map<string, string[]>()
for (const shape of SHAPES) {
  if (shape.unseedable) continue
  const block = testBlock(shape)
  if (!block) continue
  const group = groupOf(shape)
  groups.set(group, [...(groups.get(group) ?? []), block])
}

const check = process.argv.includes('--check')
let stale = false

/**
 * Format with the repo's own formatter before comparing or committing.
 *
 * Without this the staleness gate is unusable: biome reformats whatever the
 * generator emits, so the committed file never equals the raw template and
 * `--check` fails forever. Both sides go through the formatter instead, which
 * also means the generated specs are not a formatting exception anybody has to
 * remember.
 */
const formatted = (contents: string, sampleName: string): string => {
  // Inside the project, or biome refuses the file as out of scope — and named
  // `.gen-tmp.ts` rather than `.spec.ts` so a leftover can never be collected
  // as a test.
  const tmp = join(OUT_DIR, `.${process.pid}-${sampleName}.gen-tmp.ts`)
  writeFileSync(tmp, contents)
  try {
    execFileSync('npx', ['biome', 'format', '--write', tmp], {
      cwd: join(here, '..'),
      stdio: 'ignore',
    })
    return readFileSync(tmp, 'utf8')
  } finally {
    rmSync(tmp, { force: true })
  }
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [group, blocks] of groups) {
  const name = `v1-shapes-${group}.generated.spec.ts`
  const file = join(OUT_DIR, name)
  const contents = formatted(`${header(group)}\n${blocks.join('\n')}`, name)
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (current === contents) continue
  if (check) {
    stale = true
    console.error(
      `✗ ${file} is stale — run pnpm --filter @ens-apps/e2e matrix:generate`,
    )
    continue
  }
  writeFileSync(file, contents)
  console.log(
    `wrote ${file} (${blocks.length} shape${blocks.length === 1 ? '' : 's'})`,
  )
}

if (check && stale) process.exit(1)
if (!check && groups.size === 0) {
  console.log('no cells have expectations yet — nothing to generate')
}
