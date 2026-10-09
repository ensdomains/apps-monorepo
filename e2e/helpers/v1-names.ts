/**
 * Make the manager see the ENSv1 names a test created on the fork.
 *
 * The manager finds migration candidates through bigname (#1324). How they
 * reach it depends on the run:
 *
 * - Local, real bigname (`E2E_MOCK_INDEXER` unset or false): bigname indexes
 *   the fork itself, so this only waits until it serves every name in the
 *   input. The input's fuses, expiries and records are not injected; bigname
 *   reports what is on chain, which is the point.
 * - CI (`E2E_MOCK_INDEXER=true`): there is no indexer, so flat `.eth` 2LDs are
 *   served by `mockV1Names`. A subname tree cannot be expressed there, and the
 *   test is skipped with that reason.
 *
 * Takes the same input as the portal's `mockV1Subgraph`, so the migration
 * specs keep their fixtures.
 */
import { type Page, test } from '@playwright/test'
import { isRealBigname, waitForBignameBlock, waitForBignameNames } from './bigname-sync.js'
import type {
  MockV1Name as MockV1SubgraphName,
  MockV1Node,
  MockV1Tree,
} from './mock-v1-subgraph.js'
import { type MockV1Name, mockV1Names } from './mock-v1-names.js'

type V1NamesInput = readonly MockV1SubgraphName[] | MockV1Tree

const isTree = (input: V1NamesInput): input is MockV1Tree =>
  !Array.isArray(input)

/** Every full name the input describes, parents before children. */
export function v1NamesOf(input: V1NamesInput): string[] {
  const names: string[] = []
  const walk = (node: MockV1Node, parent: string) => {
    const name = `${node.label}.${parent}`
    names.push(name)
    for (const child of node.children ?? []) walk(child, name)
  }
  if (isTree(input)) {
    for (const root of input.roots) walk(root, root.parentName ?? 'eth')
  } else {
    for (const n of input) {
      names.push(n.name)
      for (const child of n.children ?? []) walk(child, n.name)
    }
  }
  return names
}

/** The input as flat 2LDs, or null when it holds anything else. */
function asFlatNames(input: V1NamesInput): MockV1Name[] | null {
  if (!isTree(input)) {
    if (input.some((n) => (n.children?.length ?? 0) > 0)) return null
    return input.map((n) => ({
      name: n.name,
      ownerAddress: n.ownerAddress,
      type: n.type,
      fuses: n.fuses,
      expiryDate: n.expiryDate,
      records: n.records,
    }))
  }
  const flat: MockV1Name[] = []
  for (const root of input.roots) {
    if (root.kind !== 'registration') return null
    if ((root.parentName ?? 'eth') !== 'eth') return null
    if ((root.children?.length ?? 0) > 0) return null
    flat.push({
      name: `${root.label}.eth`,
      ownerAddress: root.ownerAddress ?? input.ownerAddress,
      type: root.type,
      fuses: root.ownerFuses,
      expiryDate: root.expiryDate,
      records: root.records,
    })
  }
  return flat
}

/**
 * Wait for (local) or serve (CI) the ENSv1 names in `input`. Call it before
 * the page first reads the migration list.
 */
export async function serveV1Names(
  page: Page,
  input: V1NamesInput,
): Promise<void> {
  if (isRealBigname) {
    await waitForBignameBlock()
    await waitForBignameNames(v1NamesOf(input))
    return
  }
  const flat = asFlatNames(input)
  test.skip(
    flat === null,
    'Subname trees and orphans are not expressible in the bigname route mock; run against the local bigname',
  )
  if (flat) await mockV1Names(page, flat)
}
