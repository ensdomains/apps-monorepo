/**
 * Serve a V1 parent's direct-child inventory the way bigname does, for the
 * subname recreation path in #1494 (`discoverSubnameRecreation`).
 *
 * Recreation reads `GET /v1/names/{parent}?include=counts` and
 * `GET /v1/names/{parent}/subnames`, and refuses unless both answer with a
 * `meta.as_of` checkpoint that is canonical on the RPC and at most 300 s old.
 * The flag-off impact check (`readSubnameMigrationImpact`) reads the same two
 * routes. The shared bigname mock answers the first with 404 and the second
 * with an empty page, so neither path can be exercised through it.
 *
 * Every response carries the Anvil head at request time as its checkpoint, so
 * the app's canonicality and freshness checks run against a real block. Owner,
 * resolver and wrapper state are deliberately NOT served here: the app reads
 * them from the chain at that block, which is the behaviour under test.
 *
 * Register AFTER `serveV1Names`: Playwright runs the newest matching route
 * first, and anything this helper does not own falls back to the older ones.
 */
import type { Page, Route } from '@playwright/test'
import { labelhash, namehash } from 'viem'
import { publicClient } from './anvil-client.js'

const CHAIN_ID = '11155111'
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

export type InventoryNode = {
  /** Full name, e.g. `bob.parent.eth`. */
  readonly name: string
  /** Direct children; only their names are indexed facts. */
  readonly children?: readonly InventoryNode[]
  /** Overrides the served count, to model an index that disagrees with the rows. */
  readonly subnameCount?: number | null
}

export type InventoryOptions = {
  /** Mark every envelope `completeness: 'partial'`, as bigname does mid-backfill. */
  readonly partial?: boolean
}

async function checkpoint() {
  const block = await publicClient.getBlock({ blockTag: 'latest' })
  return {
    as_of: {
      [CHAIN_ID]: {
        block_number: Number(block.number),
        block_hash: block.hash,
        timestamp: String(block.timestamp),
      },
    },
  }
}

function row(node: InventoryNode) {
  const label = node.name.split('.')[0] ?? ''
  return {
    name: node.name,
    display_name: node.name,
    namespace: 'ens',
    namehash: namehash(node.name),
    labelhash: labelhash(label),
    status: 'active',
    authority: 'ens_v1',
    subname_count:
      node.subnameCount === undefined
        ? (node.children?.length ?? 0)
        : node.subnameCount,
  }
}

export async function mockSubnameInventory(
  page: Page,
  roots: readonly InventoryNode[],
  options: InventoryOptions = {},
): Promise<void> {
  const byName = new Map<string, InventoryNode>()
  const index = (node: InventoryNode) => {
    byName.set(node.name.toLowerCase(), node)
    for (const child of node.children ?? []) index(child)
  }
  for (const root of roots) index(root)

  const meta = async () => ({
    ...(await checkpoint()),
    ...(options.partial && { completeness: 'partial' }),
  })

  await page.route(/(bigname\.sh|:5660)\/v1\/names\//, async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    const url = new URL(request.url())
    const match = url.pathname.match(/^\/v1\/names\/([^/]+)(\/subnames)?$/)
    const node =
      match && byName.get(decodeURIComponent(match[1] ?? '').toLowerCase())
    if (!node) return route.fallback()

    if (match?.[2]) {
      const children = node.children ?? []
      return route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        json: {
          data: children.map(row),
          page: {
            cursor: null,
            next_cursor: null,
            page_size: children.length,
            total_count: row(node).subname_count,
            has_more: false,
          },
          meta: await meta(),
        },
      })
    }
    return route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      json: {
        data: { ...row(node), read_status: 'ok' },
        meta: await meta(),
      },
    })
  })
}
