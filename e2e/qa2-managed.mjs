/**
 * M1/M2 — the manager-restoration branch, unreachable before the `Managed`
 * preset existed. This is the ONLY path that still issues a revocation, and the
 * one the PR body describes incorrectly (it says a missing ETHRegistry approval
 * "adds one confirmation"; the code adds two — the approval and its cleanup).
 *
 * M1: ETHRegistry -> HCA not approved -> approve + upgrade + revoke
 * M2: ETHRegistry -> HCA pre-approved  -> upgrade only
 */
import { encodeFunctionData } from 'viem'
import * as H from './qa2-lib.mjs'

const setApprovalAbi = [
  {
    name: 'setApprovalForAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [],
  },
]

const mode = process.argv[2] === 'M2' ? 'M2' : 'M1'

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.connectAndOpenDevtools(page)
  const app = await H.readAppContracts(page)

  if (mode === 'M2') {
    // Deliberately vary the state: grant ETHRegistry -> HCA up front so the
    // approval AND its cleanup should both disappear from the plan.
    console.log('M2 setup: granting ETHRegistry -> HCA before the run')
    await H.rpc('anvil_impersonateAccount', [H.WALLET])
    const data = encodeFunctionData({
      abi: setApprovalAbi,
      functionName: 'setApprovalForAll',
      args: [app.hca, true],
    })
    const hash = await H.rpc('eth_sendTransaction', [
      { from: H.WALLET, to: app.contracts.ethRegistry, data },
    ])
    await H.client.waitForTransactionReceipt({ hash })
    await H.rpc('anvil_stopImpersonatingAccount', [H.WALLET])
  }

  await H.clearActiveNames(page, drawer)
  const label = await H.seedName(page, drawer, 'Managed')
  console.log('seeded:', label)

  const before = await H.readChainState(app)
  console.log('state before:', {
    hca: before.hcaDeployed,
    base: before.baseRegistrarApproved,
    wrap: before.nameWrapperApproved,
    reg: before.ethRegistryApproved,
  })

  const expected = H.predict({
    state: before,
    unwrapped: 1,
    requiresManagerRestoration: true,
  })
  console.log(`\nO1 predicted: ${expected.n}`, expected.rows)

  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)
  console.log('\nrendered    :', summary.confirmations, `fee=${summary.fee}`)
  dialog.steps.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.slice(0, 88)}`)
  })
  console.log('rendered rows:', dialog.kinds)

  console.log('\n=== O1 ===')
  console.log(
    'count match :',
    summary.confirmations === expected.n,
    `(${summary.confirmations} vs ${expected.n})`,
  )
  console.log(
    'rows match  :',
    JSON.stringify(dialog.kinds) === JSON.stringify(expected.rows),
  )
  const hasApprove = dialog.kinds.includes('approve-manager-restoration')
  const hasRevoke = dialog.kinds.includes('cleanup-revoke')
  console.log('has "Approve manager restoration":', hasApprove)
  console.log('has "Revoke temporary HCA access":', hasRevoke)
  console.log(
    '=> manager restoration costs',
    (hasApprove ? 1 : 0) + (hasRevoke ? 1 : 0),
    'confirmations (PR body claims 1)',
  )

  const nonceBefore = await H.nonceOf()
  const result = await H.runMigration(page)
  const nonceAfter = await H.nonceOf()
  console.log(
    '\nmigration   :',
    result.ok ? 'SUCCESS' : 'FAIL',
    result.timedOut ? '(timeout)' : '',
  )
  if (!result.ok) console.log('body tail:', result.body.slice(-800))
  console.log(
    `O2 nonce    : ${nonceBefore} -> ${nonceAfter} = ${nonceAfter - nonceBefore} (predicted ${expected.n})`,
  )

  const after = await H.readChainState(app)
  console.log('\nstate after :', {
    hca: after.hcaDeployed,
    base: after.baseRegistrarApproved,
    wrap: after.nameWrapperApproved,
    reg: after.ethRegistryApproved,
  })
  console.log(
    'post-condition — ETHRegistry approval revoked:',
    before.ethRegistryApproved || hasApprove
      ? after.ethRegistryApproved === false
      : 'n/a',
    `(after=${after.ethRegistryApproved})`,
  )

  if (logs.length)
    console.log('\nconsole errors:\n' + logs.slice(0, 6).join('\n'))
} catch (e) {
  console.error('\nFAILED:', e.message)
  await page.screenshot({ path: `/tmp/qa2-${mode}-fail.png` }).catch(() => {})
  if (logs.length) console.error('console:\n' + logs.slice(0, 8).join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
