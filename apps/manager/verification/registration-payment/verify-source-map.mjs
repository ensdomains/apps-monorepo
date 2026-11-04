#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SYNC_COMMIT = 'e37040946b2b1e51f7667faf782c17305581ddec'
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

const read = (path) => readFileSync(resolve(ROOT, path), 'utf8')
const sources = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, read(path)]),
)
const currentConfig = read(
  'apps/manager/verification/registration-payment/RegistrationPayment.cfg',
)

const facts = [
  {
    name: 'the behaviour requires the exact clicked view while paying',
    source: sources.behaviour,
    text: 'While a payment is in flight, the list and figures stay as they were when the user clicked.',
  },
  {
    name: 'the click starts a mutation without a payment-view argument',
    source: sources.picker,
    text: 'onNext={() => availabilityMutation.mutate()}',
  },
  {
    name: 'busy begins from mutation or actor state after the click',
    source: sources.picker,
    text: 'const isBusy = availabilityMutation.isPending || approvalState.isApproving',
  },
  {
    name: 'the held view is first derived from props when busy renders',
    source: sources.picker,
    text: 'const held = useHeldWhile(props, props.isBusy ?? false)',
  },
  {
    name: 'useHeldWhile captures the current render value',
    source: sources.held,
    text: 'if (isHeld && !held) setHeld({ value })',
  },
  {
    name: 'controls are disabled only after busy is observed',
    source: sources.picker,
    text: '<fieldset className="contents" disabled={isBusy}>',
  },
  {
    name: 'fallback selection is blocked by busy rather than by the click',
    source: sources.picker,
    text: 'isConnected &&\n      !isBusy &&',
  },
  {
    name: 'the mutation captures only the XState snapshot revision',
    source: sources.picker,
    text: 'const pricingSnapshot = uiActor.getSnapshot()',
  },
  {
    name: 'a changed XState snapshot aborts registration start',
    source: sources.picker,
    text: 'if (uiActor.getSnapshot() !== pricingSnapshot) return',
  },
  {
    name: 'wallet debit is read from render-scope funding',
    source: sources.picker,
    text: '? { displayedWalletDebit: funding.walletDebitRaw }',
  },
  {
    name: 'the selected L2 is read from render-scope state',
    source: sources.picker,
    text: '...(l2FundingChainId === undefined ? {} : { l2FundingChainId })',
  },
  {
    name: 'the displayed L2 charge is read from render-scope quote data',
    source: sources.picker,
    text: '...(displayedL2Charge === undefined ? {} : { displayedL2Charge })',
  },
  {
    name: 'ETH funding is read from render-scope quote data',
    source: sources.picker,
    text: 'ethFunding,',
  },
  {
    name: 'the fallback effect dispatches only after methods settle',
    source: sources.fallback,
    text: 'if (isSettled && key !== undefined) select()',
  },
  {
    name: 'the payment button directly invokes the supplied callback',
    source: sources.action,
    text: 'onClick={onRetry ?? onNext}',
  },
  {
    name: 'selection events are atomic XState transitions',
    source: sources.machine,
    text: "actions: ['clearFundingSource', 'setToken', 'clearError']",
  },
]

const configFacts = [
  'CaptureViewAtClick = FALSE',
  'HoldViewWhileBusy = TRUE',
  'LockSelectionAtClick = FALSE',
  'BindStartMethodToClick = FALSE',
  'BindStartFiguresToClick = FALSE',
  'AbortOnActorChange = TRUE',
].map((text) => ({
  name: `current model declares ${text}`,
  source: currentConfig,
  text,
}))

const missing = [...facts, ...configFacts].filter(
  ({ source, text }) => !source.includes(text),
)
if (missing.length > 0) {
  for (const fact of missing) console.error(`Missing source fact: ${fact.name}`)
  console.error('Update the model-to-code map before trusting TLC.')
  process.exit(1)
}

console.log(`Source map matches ${SYNC_COMMIT}:`)
for (const { name } of facts) console.log(`- ${name}`)
console.log('Current implementation constants match RegistrationPayment.cfg.')
