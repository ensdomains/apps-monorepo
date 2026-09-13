/**
 * Ledger rows for the V1 shape matrix, derived from the shape table rather
 * than hand-written.
 *
 * ~300 hand-maintained rows would drift from the assertions within a week —
 * the catalogue and `scenarios.ts` are already only kept in step by
 * convention. Generating them means a shape and its rows cannot disagree.
 *
 * Imports the `Scenario` types **type-only**, so this module and
 * `coverage/scenarios.ts` do not form a runtime cycle: the data flows one way,
 * from here into the ledger.
 */

import { SHAPES, type Shape, type Tab } from '@ens-apps/v1-name-shapes'
import type { Scenario } from '../coverage/scenarios.js'
import { allCells, TAB_TIER } from './ids.js'

/** Depth as a word, for row titles. */
const depthLabel = (shape: Shape): string =>
  ['2LD', '3LD', '4LD'][shape.path.length - 1] ?? `${shape.path.length + 1}LD`

/**
 * The oracle string is generated from the shape's own rationale rather than
 * restated per row. A hand-written oracle beside a generated assertion is a
 * second source of truth, and the one that rots.
 */
const oracleFor = (shape: Shape, tab: Tab): string =>
  shape.unseedable
    ? `Not seedable: ${shape.unseedable.reason}`
    : `${tab.title}. Shape: ${shape.rationale}`

/**
 * An unseedable shape is **one** gap, not one per tab.
 *
 * Emitting a cell per tab would add a dozen EXEMPT rows — all terminal, all
 * free — for a shape nobody can build, which flatters the ratchet in exactly
 * the direction that matters least. One row per unseedable shape, on the
 * overview tab, carrying the reason.
 */
const cellsToEmit = () =>
  allCells(SHAPES).filter(
    ({ shape, tab }) => !shape.unseedable || tab.id === 'overview',
  )

export const v1MatrixScenarios = (): Scenario[] =>
  cellsToEmit().map(({ shape, tab, id }) => ({
    id,
    kind: 'scenario' as const,
    tier: TAB_TIER[tab.id] ?? 'R3',
    phase: 'P3' as const,
    section: '5.V',
    area: 'v1-shape-matrix',
    app: 'portal' as const,
    title: `${depthLabel(shape)} ${shape.id} · ${tab.id}`,
    oracle: oracleFor(shape, tab),
    ...(shape.unseedable
      ? {
          exempt: {
            reason: shape.unseedable.reason,
            approvedBy: 'sugh01',
            date: '2026-09-13',
          },
        }
      : {}),
  }))
