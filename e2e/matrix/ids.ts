/**
 * Scenario ids for the V1 shape matrix, and which cells exist.
 *
 * An id is `<tab prefix><shape slot>` — `VO24` is the Ownership tab of shape
 * 24. Both halves are load-bearing:
 *
 * - the **prefix** decides the tier, because a tab's risk is a property of the
 *   tab (`VT` transfer and `VF` fuses are irreversible, the rest are not);
 * - the **slot** is permanent, so a row keeps meaning the same thing forever.
 *   Renumbering a shape would quietly re-point every existing ledger row and
 *   defect reference at different behaviour.
 *
 * `reconcile.ts` parses tags with `/@scenario:([A-Za-z]+[0-9]+)/` and derives
 * the tier from the longest alphabetic prefix, so prefixes must be letters and
 * slots must be digits — enforced by the package's own tests.
 */

import { type Shape, TABS, type Tab } from '@ens-apps/v1-name-shapes'
import type { Tier } from '../coverage/scenarios.js'

/**
 * Tier per tab, by cost of being wrong rather than by how visible the surface
 * is. Transfer and fuses move or destroy something irreversibly; the
 * authorization surfaces decide who is *shown* to be able to act, which is what
 * people act on; the rest are display.
 */
export const TAB_TIER: Record<string, Tier> = {
  transfer: 'R0',
  fuses: 'R0',
  overview: 'R2',
  ownership: 'R2',
  roles: 'R2',
  resolver: 'R2',
  'create-subname': 'R2',
  'change-resolver': 'R2',
  records: 'R3',
  subnames: 'R3',
  registry: 'R3',
  token: 'R3',
  history: 'R3',
  address: 'R3',
}

/**
 * Shapes that carry the V2-only refusal cells.
 *
 * `/roles`, `/create-subname` and `/change-resolver` branch on nothing but
 * `protocolVersion === 'ENSv1'`, so their rendering cannot vary across shapes
 * and asserting them 28 times would be 28 copies of one fact. One 2LD and one
 * 3LD, because the *copy* differs by depth even though the decision does not,
 * and E2E-013's complaint is specifically about a subname's parent being sent
 * to `/create-subname`.
 */
const V2_ONLY_WITNESSES = new Set([1, 20])

/** Whether a tab has a cell for this shape. */
export const tabApplies = (tab: Tab, shape: Shape): boolean =>
  tab.v2Only ? V2_ONLY_WITNESSES.has(shape.n) : true

/** Every tab that has a cell for this shape. */
export const cellsFor = (shape: Shape): readonly Tab[] =>
  TABS.filter((tab) => tabApplies(tab, shape))

export const scenarioIdFor = (tab: Tab, shape: Shape): string =>
  `${tab.prefix}${shape.n}`

/** Every (shape, tab) pair the matrix claims, in a stable order. */
export const allCells = (
  shapes: readonly Shape[],
): readonly { shape: Shape; tab: Tab; id: string }[] =>
  shapes.flatMap((shape) =>
    cellsFor(shape).map((tab) => ({
      shape,
      tab,
      id: scenarioIdFor(tab, shape),
    })),
  )
