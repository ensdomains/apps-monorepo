#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SYNC_COMMIT = '0fadce5156326f30af42eb1a47d01554631765d8'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')

const files = {
  behaviour:
    'apps/manager/src/features/register-v2/workflow/pricing/BEHAVIOUR.md',
  picker:
    'apps/manager/src/features/register-v2/workflow/pricing/components/TokenPickerContent.tsx',
  action:
    'apps/manager/src/features/register-v2/workflow/pricing/components/PaymentAction.tsx',
  held: 'apps/manager/src/features/register-v2/workflow/pricing/hooks/useHeldWhile.ts',
  fallback:
    'apps/manager/src/features/register-v2/workflow/pricing/hooks/useFallbackPaymentChoice.ts',
  machine:
    'apps/manager/src/features/register-v2/state/registrationUi.machine.ts',
}

const coveredPaths = Object.values(files)

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
    `Registration payment verification is stale: covered code differs from ${SYNC_COMMIT}.`,
  )
  console.error('Review the diff, update the model, then move the sync commit.')
  process.exit(1)
}

console.log(`Covered paths match reviewed baseline ${SYNC_COMMIT}:`)
for (const path of coveredPaths) console.log(`- ${path}`)
console.log(
  'This checks provenance only; the retained Vitest regressions are the executable behavior witnesses.',
)
