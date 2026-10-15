/**
 * Panoptes fixture — the real indexer, as an oracle rather than as scenery.
 *
 * `helpers/indexer-sync.ts` already answers "has the indexer caught up yet?".
 * This module answers the two questions that come *before* that, and which have
 * both bitten this suite:
 *
 * 1. **Is the indexer watching the same contracts the apps talk to?** A
 *    misconfigured-but-running indexer is the single most expensive failure
 *    mode available here — it returns HTTP 200 with zero rows, and the UI
 *    presents that as a confident negative ("No role holders yet"). Nothing
 *    errors. `assertManifestMatchesConfig` is goal §6 B0 turned into an
 *    assertion so it cannot rot into a stale comment.
 *
 * 2. **Did this query genuinely return nothing, or did it fail?** `query`
 *    below throws on transport failure and on a GraphQL `errors` array. That is
 *    deliberately the opposite of `indexer-sync`'s internal helper, which
 *    swallows both and returns `null` — correct when you are polling and
 *    waiting, catastrophic when you are asserting. An oracle that cannot
 *    distinguish "empty" from "broken" is the INV4 defect, not a check for it.
 *
 * Rule 3 applies: route-mocking the indexer is fine when the indexer is
 * scenery. It is invalid when the scenario's oracle *is* the indexer — those
 * scenarios use this.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

const here = dirname(fileURLToPath(import.meta.url))
const e2eRoot = resolve(here, '..')

export const PANOPTES_URL =
  process.env.E2E_INDEXER_GRAPHQL_URL ?? 'http://127.0.0.1:5655/graphql'

/** Where the local indexer's contract manifest is mounted from. */
const MANIFEST_PATH = resolve(e2eRoot, 'infra/panoptes/contracts.json')

/**
 * Manifest key → the `ensL1Contracts[sepolia]` key it must equal.
 *
 * Only entries that exist on both sides are listed; everything omitted is
 * accounted for below rather than silently ignored, because "we only checked
 * the ones that matched" is how a manifest check passes while being useless.
 *
 * Deliberately unmapped, and why:
 *   root_registry        from ethRegistry.getParent(); ensjs does not expose it
 *   registry_datastore   vestigial — contracts-v2 has no RegistryDatastore
 *   l2_registry_datastore  same
 *   l2_eth_registry      L2 deployment; not in the L1 config by definition
 *   l2_eth_registrar     same
 *   temporary_registrar  migration-window contract, not in ensjs
 *   old_ens_registry     pre-migration V1 deployment, not in ensjs
 *   old_public_resolver  same
 *   eth_reverse_registrar  not exposed by ensjs under any key
 *   *_block              block numbers, not addresses
 */
const MANIFEST_TO_ENSJS: Record<string, string> = {
  // V1 — note `ens_registry` is the *legacy* registry; V2's is `eth_registry`.
  ens_registry: 'ensLegacyRegistry',
  base_registrar: 'ensBaseRegistrarImplementation',
  eth_registrar_controller: 'ensEthRegistrarController',
  public_resolver: 'ensPublicResolver',
  reverse_registrar: 'ensReverseRegistrar',
  name_wrapper: 'ensNameWrapper',
  // V2
  eth_registry: 'ensRegistry',
  migration_helper: 'ensMigrationHelper',
  locked_migration_controller: 'ensLockedMigrationController',
  unlocked_migration_controller: 'ensUnlockedMigrationController',
}

export interface ManifestMismatch {
  manifestKey: string
  ensjsKey: string
  manifest: string
  ensjs: string
}

const lower = (v: unknown) => String(v ?? '').toLowerCase()

export function readManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
}

/**
 * Every mapped manifest address, compared against the config the apps read.
 * Returns the mismatches — empty means the indexer is watching what the apps
 * talk to.
 */
export function manifestMismatches(): ManifestMismatch[] {
  const manifest = readManifest()
  const cfg = ensL1Contracts[supportedL1Chains.sepolia] as Record<
    string,
    { address?: string } | undefined
  >
  const out: ManifestMismatch[] = []
  for (const [manifestKey, ensjsKey] of Object.entries(MANIFEST_TO_ENSJS)) {
    const fromConfig = lower(cfg[ensjsKey]?.address)
    const fromManifest = lower(manifest[manifestKey])
    // A key that vanished from either side is a mismatch, not a skip: silently
    // dropping it is how this check becomes decorative.
    if (fromConfig !== fromManifest) {
      out.push({
        manifestKey,
        ensjsKey,
        manifest: fromManifest || '(absent)',
        ensjs: fromConfig || '(absent from ensjs)',
      })
    }
  }
  return out
}

/** Throws with the full diff if the indexer is watching anything else. */
export function assertManifestMatchesConfig(): void {
  const bad = manifestMismatches()
  if (bad.length === 0) return
  throw new Error(
    `Panoptes is indexing ${bad.length} contract(s) the apps do not talk to. ` +
      'Every query against it can return HTTP 200 with zero rows, which the UI ' +
      'renders as a confident negative:\n' +
      bad
        .map(
          (m) =>
            `  ${m.manifestKey} (ensjs ${m.ensjsKey})\n    manifest: ${m.manifest}\n    ensjs:    ${m.ensjs}`,
        )
        .join('\n'),
  )
}

export class PanoptesQueryError extends Error {}

/**
 * A GraphQL query that **throws** rather than returning null.
 *
 * Use this whenever the result is an oracle. Transport failure, a non-2xx, and
 * a GraphQL `errors` array are all errors here — never an empty result — so a
 * broken indexer can never be mistaken for a true negative.
 */
export async function query<T>(
  document: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(PANOPTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: document, variables }),
    })
  } catch (cause) {
    throw new PanoptesQueryError(
      `Panoptes unreachable at ${PANOPTES_URL}: ${(cause as Error).message}`,
    )
  }
  if (!res.ok) {
    throw new PanoptesQueryError(
      `Panoptes returned HTTP ${res.status} for query: ${document.slice(0, 120)}`,
    )
  }
  const json = (await res.json()) as { data?: T; errors?: unknown[] }
  if (json.errors?.length) {
    throw new PanoptesQueryError(
      `Panoptes returned GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`,
    )
  }
  if (json.data === undefined) {
    throw new PanoptesQueryError('Panoptes returned no data and no errors')
  }

  // Measured 2026-08-12: Panoptes answers an *unknown field* with HTTP 200,
  // no `errors` array, and `{"data":{"thisFieldDoesNotExist":null}}`. A
  // spec-compliant server rejects that at validation time. Here it means a
  // typo, or a field Panoptes later renames, silently becomes "no data" —
  // which is the INV4 confident-negative defect arriving through a door that
  // requires no misconfiguration at all.
  //
  // A valid field always resolves to a value (a list comes back as `[]`, never
  // `null`), so a null top-level field is a reliable signal that the field does
  // not exist rather than that it is empty.
  const nulls = Object.entries(json.data as Record<string, unknown>)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  if (nulls.length > 0) {
    throw new PanoptesQueryError(
      `Panoptes resolved ${nulls.map((n) => `"${n}"`).join(', ')} to null. ` +
        'It does not reject unknown fields — it returns null for them with HTTP 200 and no errors — ' +
        'so this is almost certainly a field that does not exist in its schema, not an empty result. ' +
        'Check the name with assertQueryFields() before treating any absence as a true negative.',
    )
  }
  return json.data
}

interface IntrospectedField {
  name: string
  args: { name: string }[]
}

let schemaCache: Map<string, IntrospectedField> | null = null

/** Query-root fields and their argument names, introspected once per process. */
async function queryFields(): Promise<Map<string, IntrospectedField>> {
  if (schemaCache) return schemaCache
  // Reads the root type out of `__schema.types` rather than asking for
  // `__schema { queryType { fields } }` directly, because **Panoptes does not
  // honour the selection set on `__schema`** — measured 2026-08-12, that exact
  // query came back as `queryType: { name: "Query" }` with no `fields`, plus
  // `mutationType`, `subscriptionType` and `types`, none of which were asked
  // for. It serves a canned introspection payload, so the only reliable
  // approach is to take the whole thing and navigate it here.
  const data = await query<{
    __schema: {
      queryType?: { name?: string }
      types?: { name?: string; fields?: IntrospectedField[] | null }[]
    }
  }>(
    '{ __schema { queryType { name } types { name fields { name args { name } } } } }',
  )

  const rootName = data.__schema.queryType?.name ?? 'Query'
  const root = data.__schema.types?.find((t) => t.name === rootName)
  if (!root?.fields?.length) {
    throw new PanoptesQueryError(
      `Could not introspect Panoptes's "${rootName}" root type — it returned ${data.__schema.types?.length ?? 0} types and no usable field list. ` +
        'Without this, an unrecognised query argument cannot be caught, and Panoptes ignores those silently.',
    )
  }
  schemaCache = new Map(root.fields.map((f) => [f.name, f]))
  return schemaCache
}

/**
 * Assert a query-root field exists, and that it accepts every argument named.
 *
 * Necessary because Panoptes **silently ignores arguments it does not
 * recognise** — measured 2026-08-12: `events(bogusArg: 1, first: 1)` returned
 * ten-plus rows, so the bogus argument was dropped *and took `first` with it*.
 * A `where:` clause it does not understand is likewise ignored, meaning a
 * filtered query quietly returns the unfiltered set and any assertion over it
 * is meaningless rather than merely wrong.
 *
 * Call this once per query shape before relying on the result as an oracle.
 */
export async function assertQueryFields(
  field: string,
  args: string[] = [],
): Promise<void> {
  const fields = await queryFields()
  const found = fields.get(field)
  if (!found) {
    throw new PanoptesQueryError(
      `Panoptes has no query-root field "${field}". Available: ${[...fields.keys()].sort().join(', ')}`,
    )
  }
  const known = new Set(found.args.map((a) => a.name))
  const unknown = args.filter((a) => !known.has(a))
  if (unknown.length > 0) {
    throw new PanoptesQueryError(
      `Panoptes's "${field}" does not accept ${unknown.map((a) => `"${a}"`).join(', ')}. ` +
        'It ignores unrecognised arguments silently rather than erroring, so this query would ' +
        `have returned an unfiltered result set that looks entirely plausible. Accepted: ${[...known].sort().join(', ')}`,
    )
  }
}

/** True when the endpoint answers a trivial query. Throws nothing. */
export async function isReachable(): Promise<boolean> {
  try {
    await query<{ __typename: string }>('{ __typename }')
    return true
  } catch {
    return false
  }
}

/**
 * The newest block Panoptes holds an event for.
 *
 * Throws if the indexer is unreachable — that is the point of this module.
 * Returns `null` only when the indexer is genuinely empty, which is a real and
 * distinguishable state.
 */
export async function newestIndexedBlock(): Promise<number | null> {
  const data = await query<{ events: { blockNumber: number }[] }>(
    '{ events(first: 1, orderBy: "blockNumber", orderDirection: "desc") { blockNumber } }',
  )
  return data.events?.[0]?.blockNumber ?? null
}

export interface Panoptes {
  url: string
  query: typeof query
  newestIndexedBlock: typeof newestIndexedBlock
  manifestMismatches: typeof manifestMismatches
  assertManifestMatchesConfig: typeof assertManifestMatchesConfig
  isReachable: typeof isReachable
}

/**
 * Playwright fixture body. Asserts the manifest once, on first use, so any spec
 * that takes an indexer oracle cannot run against a misconfigured indexer.
 */
export function createPanoptes(): Panoptes {
  assertManifestMatchesConfig()
  return {
    url: PANOPTES_URL,
    query,
    newestIndexedBlock,
    manifestMismatches,
    assertManifestMatchesConfig,
    isReachable,
  }
}
