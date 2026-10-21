/**
 * Make the manager see the ENSv1 names a test created on the fork.
 *
 * The manager finds migration candidates through bigname (#1324). How they
 * reach it depends on the run:
 *
 * - Local, real bigname (`E2E_MOCK_BIGNAME` unset or false): bigname indexes
 *   the fork itself, so this only waits until it serves every name in the
 *   input. The input's fuses, expiries and records are not injected; bigname
 *   reports what is on chain, which is the point.
 * - CI (`E2E_MOCK_BIGNAME=true`): there is no indexer, so flat `.eth` 2LDs are
 *   served by `mockV1Names`. A subname tree cannot be expressed there, and the
 *   test is skipped with that reason.
 *
 * Takes a flat list or a tree (`v1-name-tree.ts`), so the migration
 * specs keep their fixtures.
 */
import { type Page, test } from '@playwright/test'
import {
  isRealBigname,
  waitForBignameBlock,
  waitForBignameNames,
  waitForBignameRecordKeys,
} from './bigname-sync.js'
import type { MockDomain } from './mock-bigname.js'
import { type MockV1Name, mockV1Names } from './mock-v1-names.js'
import type {
  MockV1Node,
  MockV1Records,
  MockV1Name as MockV1SubgraphName,
  MockV1Tree,
} from './v1-name-tree.js'

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

/** Every name in the input that carries records, with those records. */
function v1RecordsOf(input: V1NamesInput): [string, MockV1Records][] {
  const out: [string, MockV1Records][] = []
  const walk = (node: MockV1Node, parent: string) => {
    const name = `${node.label}.${parent}`
    if (node.records) out.push([name, node.records])
    for (const child of node.children ?? []) walk(child, name)
  }
  if (isTree(input)) {
    for (const root of input.roots) walk(root, root.parentName ?? 'eth')
  } else {
    for (const n of input) {
      if (n.records) out.push([n.name, n.records])
      for (const child of n.children ?? []) walk(child, n.name)
    }
  }
  return out
}

/** The optional fields a tree root passes to the mock only when set. */
const optionalRootFields = (root: MockV1Node): Partial<MockV1Name> => ({
  ...(root.resolver && { resolver: root.resolver }),
  ...(root.unreserved && { unreserved: true }),
  ...(root.registrantAddress && { registrantAddress: root.registrantAddress }),
})

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
      ...optionalRootFields(root),
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
  options: {
    /**
     * The fixture's `mockBigname`, for tests that also read the dashboard. Its
     * name list comes from the shared bigname mock, not from `mockV1Names`,
     * so in mock mode the names are registered there too, as ENSv1 rows.
     */
    readonly indexer?: { readonly addName: (domain: MockDomain) => void }
  } = {},
): Promise<void> {
  if (isRealBigname) {
    await waitForBignameBlock()
    await waitForBignameNames(v1NamesOf(input))
    for (const [name, records] of v1RecordsOf(input))
      await waitForBignameRecordKeys(name, {
        texts: records.texts?.map((t) => t.key),
        coinTypes: records.addresses?.map((a) => a.coinType),
        contentHash: Boolean(records.contentHash),
        abiContentTypes: records.abiContentTypes,
      })
    return
  }
  const flat = asFlatNames(input)
  test.skip(
    flat === null,
    'Subname trees and orphans are not expressible in the bigname route mock; run against the local bigname',
  )
  if (!flat) return
  await mockV1Names(page, flat)
  for (const n of flat)
    options.indexer?.addName({
      name: n.name,
      owner: n.ownerAddress,
      protocol: 'v1',
      ...(n.expiryDate !== undefined && { expiryDate: n.expiryDate }),
    })
}
