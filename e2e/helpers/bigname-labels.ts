/**
 * Tell the local bigname the plaintext of labels the fixtures create.
 *
 * bigname learns a label only from an event that carries it as text
 * (`NameRegistered`, `NameWrapped`, a resolver's `NameChanged`, …) or from a
 * rainbow-table import. `ENSRegistry.setSubnodeOwner` emits `NewOwner`, which
 * carries the labelhash alone, so a registry-only V1 subname is listed as
 * `[<labelhash>].parent.eth` and its owner's upgrade list shows it that way.
 * The hosted bigname can fill such labels from a rainbow import; the local one
 * has none, so it cannot name registry-only V1 subnames on its own.
 *
 * This writes the label into `bigname_phase.label_preimages`, the table both
 * sources feed. Names are rendered from it at read time, so the next lookup
 * shows the plaintext with no reindex. A no-op in mock mode, where the route
 * mock already serves full names.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { keccak256, toHex } from 'viem'

import { isRealBigname } from './bigname-sync.js'

const COMPOSE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../infra/docker-compose.yml',
)

/** Plain lowercase labels only: they go into SQL, and must normalise as is. */
const SAFE_LABEL = /^[a-z0-9-]+$/

export async function seedBignameLabels(
  labels: readonly string[],
): Promise<void> {
  if (!isRealBigname || labels.length === 0) return
  for (const label of labels) {
    if (!SAFE_LABEL.test(label))
      throw new Error(`[seedBignameLabels] unsupported label: ${label}`)
  }
  // The normaliser version is bigname's own; copy it from a chain-sourced row
  // rather than pinning it here.
  const rows = labels
    .map(
      (label) =>
        `('${keccak256(toHex(label))}', convert_to('${label}', 'UTF8'), '${label}')`,
    )
    .join(', ')
  const sql = `
    INSERT INTO bigname_phase.label_preimages
      (labelhash, raw_label, decoded_label, normalizer_version,
       normalized_under_version, source_kind, source_priority, provenance)
    SELECT v.labelhash, v.raw_label, v.decoded_label,
           (SELECT normalizer_version FROM bigname_phase.label_preimages
             WHERE source_kind <> 'e2e_seed' LIMIT 1),
           true, 'e2e_seed', 10, '{}'::jsonb
      FROM (VALUES ${rows}) AS v(labelhash, raw_label, decoded_label)
    ON CONFLICT (labelhash) DO NOTHING`
  await promisify(execFile)('docker', [
    'compose',
    '-f',
    COMPOSE_FILE,
    '--profile',
    'bigname',
    'exec',
    '-T',
    'bigname-postgres',
    'psql',
    '-U',
    'bigname',
    '-d',
    'bigname',
    '-v',
    'ON_ERROR_STOP=1',
    '-qc',
    sql,
  ])
}
