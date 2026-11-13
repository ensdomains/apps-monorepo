/**
 * Render the V1 shape matrix as a document a person can work from.
 *
 *     pnpm --filter @ens-apps/e2e matrix:docs
 *     pnpm --filter @ens-apps/e2e matrix:docs --check   # CI staleness gate
 *
 * The audience is someone testing V1 behaviour by hand or by browser agent, not
 * someone reading the suite: it answers "what shapes exist, what is each one a
 * witness for, which surfaces are claimed about it, and where is that claim
 * recorded" without opening any TypeScript.
 *
 * It is generated for the same reason the specs are — 40-odd shapes times 14
 * tabs is ~400 rows, and a hand-maintained copy of a table that already exists
 * in code is a table that is wrong within a month. `e2e-test-catalogue.md`
 * points here rather than inlining it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  depthOf,
  SHAPES,
  type Shape,
  type ShapeId,
} from '@ens-apps/v1-name-shapes'
import { expectationFor } from './expectations.js'
import { cellsFor, scenarioIdFor, TAB_TIER } from './ids.js'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, '..', 'docs', 'v1-shape-matrix.generated.md')

/** `l1.v1m-24-<timestamp>.eth` — the shape of the name each slot seeds. */
const exampleName = (shape: Shape): string => {
  const labels = shape.path
    .slice(1)
    .map((_, index) => `l${index + 1}`)
    .reverse()
  return [...labels, `v1m-${shape.n}-<ts>`, 'eth'].join('.')
}

const describePath = (shape: Shape): string =>
  shape.path
    .map((node, index) => {
      const level = index === 0 ? '.eth 2LD' : `L${index + 2}`
      const who = node.holder ?? 'user'
      const controller = node.controller
        ? `, controller ${node.controller}`
        : ''
      return `${level}: ${node.wrap} (held by ${who}${controller})`
    })
    .join(' → ')

/** One line per cell: what is claimed, and how that claim currently stands. */
const cellRows = (shape: Shape): string[] =>
  cellsFor(shape).map((tab) => {
    const expectation = expectationFor(shape.id as ShapeId, tab.id)
    const id = scenarioIdFor(tab, shape)
    const claim = expectation?.todo
      ? `_not yet decided — ${expectation.todo}_`
      : (expectation?.title ?? '_no expectation written_')
    const status = expectation?.defect
      ? `**${expectation.defect.id}** — ${expectation.defect.actual}`
      : expectation && !expectation.todo
        ? 'asserted'
        : 'open'
    return `| \`${id}\` | ${TAB_TIER[tab.id] ?? '—'} | [${tab.id}](${tab.path('<name>')}) | ${claim} | ${status} |`
  })

const shapeSection = (shape: Shape): string => {
  const head = [
    `### ${shape.n} · \`${shape.id}\``,
    '',
    `**Witness for:** ${shape.rationale}`,
    '',
    `- **Levels:** ${describePath(shape)}`,
    `- **Connected wallet plays:** ${shape.role}`,
    `- **Registration:** ${shape.registration}`,
    ...(shape.tails?.length
      ? [`- **Built with:** ${shape.tails.join(', ')}`]
      : []),
    `- **ens-app-v3 \`NameType\`:** \`${shape.v3NameType}\` _(traceability only — never asserted)_`,
  ]

  if (shape.unseedable) {
    return [
      ...head,
      '',
      `> **Not constructible on the fork.** ${shape.unseedable.reason} The matrix`,
      '> records one EXEMPT ledger row for this shape rather than pretending the',
      '> surfaces below are covered.',
      '',
    ].join('\n')
  }

  return [
    ...head,
    `- **Name it seeds:** \`${exampleName(shape)}\``,
    '',
    '| Scenario | Tier | Tab | What the matrix claims | Status |',
    '| --- | --- | --- | --- | --- |',
    ...cellRows(shape),
    '',
  ].join('\n')
}

const groups: { title: string; note: string; match: (s: Shape) => boolean }[] =
  [
    {
      title: '2LD — `.eth` second-level names',
      note: 'The only V1 shape whose ownership is split across two contracts: the BaseRegistrar holds the ERC-721 (the *registrant*) and the ENSRegistry holds the *controller*. Most V1 ownership bugs live here.',
      match: (s) => depthOf(s) === 2 && s.registration === 'active',
    },
    {
      title: '3LD — subnames',
      note: 'A subname has no registrar token and no expiry of its own; it is a registry node, or a NameWrapper token whose expiry is clamped to its parent’s. Both parent wrap classes appear, in both mismatch directions.',
      match: (s) => depthOf(s) === 3 && s.registration === 'active',
    },
    {
      title: '4LD — one level deeper',
      note: 'Depth is not a full axis — ens-app-v3 collapses all subnames to one class. These shapes exist for the three places depth actually bites: the one-level parent read, the two-level `getEth2LDAncestor` jump, and the `.eth`-2LD-only expiry read.',
      match: (s) => depthOf(s) === 4 && s.registration === 'active',
    },
    {
      title: 'Lapsed — grace and expired',
      note: '**These move the fork clock forward permanently.** They run in their own Playwright project (`portal-v1-matrix-time`) and sort last, and nothing here may use `withChainSnapshot`: an `evm_revert` rewinds the chain but not Panoptes, which then halts for good.',
      match: (s) => s.registration !== 'active',
    },
    {
      title: 'Not constructible',
      note: 'Recorded so the gap is visible in the ledger as EXEMPT rather than as silence.',
      match: (s) => !!s.unseedable,
    },
  ]

const seedable = SHAPES.filter((shape) => !shape.unseedable)
const cellCount = seedable.reduce(
  (total, shape) => total + cellsFor(shape).length,
  0,
)
const written = seedable.reduce(
  (total, shape) =>
    total +
    cellsFor(shape).filter((tab) => {
      const expectation = expectationFor(shape.id as ShapeId, tab.id)
      return expectation && !expectation.todo
    }).length,
  0,
)

const doc = `<!-- GENERATED by e2e/matrix/render-docs.ts — do not edit. -->
<!-- Regenerate: pnpm --filter @ens-apps/e2e matrix:docs -->

# V1 name-shape matrix

Every way a V1 name can be held, against every portal surface that renders one.

**${SHAPES.length} shapes · ${cellCount} cells · ${written} asserted.** Each cell is one
Playwright test in \`e2e/projects/portal/matrix/*.generated.spec.ts\`, tagged with the
scenario id below, so a cell's state is visible in
[\`e2e-coverage.md\`](./e2e-coverage.md) like any other row.

## How to read a row

- **Scenario** — \`<tab prefix><shape slot>\`. \`VO24\` is the Ownership tab of shape 24.
  The slot is permanent: it is never renumbered and never reused, so a defect that
  names a cell keeps meaning the same thing.
- **Status** — *asserted* means the claim holds today. A defect id means the claim is
  **correct and currently violated**: the test carries \`test.fail()\`, the ledger reads
  DEFECT rather than red noise, and the day the app is fixed the test reports
  "expected to fail, but passed".
- **Tab** — the route, relative to the portal origin, with \`<name>\` standing in for the
  seeded name.

## What is deliberately not covered

- **DNS names.** No fixture machinery exists for them; out of scope for this phase and
  recorded here so the gap is not mistaken for coverage.
- **Record keys the app does not hardcode.** For a V1 name the portal discovers which
  text keys exist from the public V1 subgraph, which cannot know about a fork-seeded
  name — so only keys in the app's built-in default set can be asserted locally. The
  matrix seeds a second key (\`url\`) anyway, as the witness for that gap.
- **Anything that writes.** The matrix only reads. Transfers are executed by the
  \`F*\` scenarios in \`transfer.spec.ts\`.

${groups
  .map(({ title, note, match }) => {
    const members = SHAPES.filter(match)
    if (members.length === 0) return ''
    return `## ${title}\n\n${note}\n\n${members.map(shapeSection).join('\n')}`
  })
  .filter(Boolean)
  .join('\n')}`

const check = process.argv.includes('--check')
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''

if (current === doc) {
  console.log('v1-shape-matrix.generated.md is up to date')
} else if (check) {
  console.error(
    `✗ ${OUT} is stale — run pnpm --filter @ens-apps/e2e matrix:docs`,
  )
  process.exit(1)
} else {
  writeFileSync(OUT, doc)
  console.log(`wrote ${OUT} (${SHAPES.length} shapes, ${cellCount} cells)`)
}
