#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SYNC_COMMIT = '6977db2d7d14a8d6c48436d97d4fee6ed703285b'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')

const coveredPaths = [
  'apps/manager/src/features/migration/state/migrationUi.machine.ts',
  'apps/manager/src/features/migration/service/migrationService.ts',
  'apps/manager/src/features/migration/service/migrationBatchJournal.ts',
  'apps/manager/src/features/migration/service/buildMigrationPlan.ts',
  'apps/manager/src/features/migration/service/verifyAtomicMigrationBatch.ts',
  'apps/manager/src/features/migration/service/migrationInvariants.ts',
  'apps/manager/src/features/migration/service/copyMigrationReadiness.ts',
  'apps/manager/src/features/migration/service/subnameRecreation.ts',
  'apps/manager/src/features/migration/service/rpcSubnameMigrationImpact.ts',
  'apps/manager/src/features/migration/service/graceRenewal.ts',
  'apps/manager/src/features/migration/service/graceRenewalPending.ts',
  'apps/manager/src/features/migration/service/migrationProgress.ts',
  'apps/manager/src/features/migration/service/buildStepDescriptors.ts',
  'apps/manager/src/features/migration/service/decodeMigrationError.ts',
  'apps/manager/src/features/migration/hooks/useMigrationRecoverySnapshot.ts',
  'apps/manager/src/features/migration/pages/MigrationPage.tsx',
  'apps/manager/src/features/migration/commemorative-nft/migrationCompletion.ts',
  'packages/migration/src/service/classifyNames.ts',
  'packages/migration/src/service/subnameMigrationImpact.ts',
]

try {
  execFileSync('git', ['ls-files', '--error-unmatch', '--', ...coveredPaths], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  execFileSync('git', ['diff', '--quiet', SYNC_COMMIT, '--', ...coveredPaths], {
    cwd: ROOT,
    stdio: 'ignore',
  })
} catch {
  console.error(
    `Migration verification is stale: covered code differs from ${SYNC_COMMIT}.`,
  )
  console.error('Review the diff, update the model, then move the sync commit.')
  process.exit(1)
}

console.log(`Covered migration paths match ${SYNC_COMMIT}:`)
for (const path of coveredPaths) console.log(`- ${path}`)
console.log('This checks source provenance. TLC and Vitest check behavior.')
