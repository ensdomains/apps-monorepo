/**
 * Settles a disputed claim: on a FRESH HCA the UI predicts 3 confirmations, but
 * Claude-in-Chrome reported only 2 real transactions, with the HCA deployment
 * folded into the upgrade transaction rather than having its own.
 *
 * Method: reset first (run e2e/qa-reset.mjs), seed one unwrapped name, WAIT FOR
 * THE FORK TO GO QUIET so the seeding tx is mined before the baseline is taken,
 * then capture and decode every wallet transaction in the window and record the
 * block at which the HCA's bytecode first becomes non-empty.
 */
import * as H from './qa2-lib.mjs'

const SEL = {
  '0xfca247ac': 'BaseRegistrar.register (seeding)',
  '0xa22cb465': 'setApprovalForAll',
  '0x095ea7b3': 'ERC721.approve',
  '0xf9056eaa': 'HCA executeByOwner',
}

/** Wait until the wallet nonce stops moving, so seeding is fully mined. */
const waitForQuiet = async (label) => {
  let prev = -1
  for (let i = 0; i < 40; i++) {
    const n = await H.nonceOf()
    if (n === prev) {
      console.log(`${label}: fork quiet at nonce ${n}`)
      return n
    }
    prev = n
    await new Promise((r) => setTimeout(r, 3000))
  }
  return prev
}

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Unwrapped')
  console.log('seeded:', seeded)

  const nb = await waitForQuiet('after seeding')
  const before = await H.readChainState(app)
  console.log('state before:', {
    hcaDeployed: before.hcaDeployed,
    base: before.baseRegistrarApproved,
    wrap: before.nameWrapperApproved,
  })
  const expected = H.predict({ state: before, unwrapped: 1 })
  console.log('O1 predicted:', expected.n, expected.rows)

  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)
  console.log('rendered    :', summary.confirmations, dialog.kinds)

  const blockBefore = Number.parseInt(await H.rpc('eth_blockNumber', []), 16)
  const nb2 = await H.nonceOf()
  const r = await H.runMigration(page)
  const na = await H.nonceOf()
  const blockAfter = Number.parseInt(await H.rpc('eth_blockNumber', []), 16)

  console.log('\nmigration   :', r.ok ? 'SUCCESS' : 'FAIL')
  console.log(`baseline nonce (quiet) ${nb} | at-run ${nb2} -> after ${na}`)
  console.log(`raw nonce delta: ${na - nb2}   (predicted ${expected.n})`)

  const txs = []
  for (let b = blockBefore; b <= blockAfter; b++) {
    const blk = await H.rpc('eth_getBlockByNumber', [`0x${b.toString(16)}`, true])
    for (const tx of blk?.transactions ?? []) {
      if ((tx.from ?? '').toLowerCase() !== H.WALLET.toLowerCase()) continue
      const sel = (tx.input ?? '').slice(0, 10)
      txs.push({ nonce: Number.parseInt(tx.nonce, 16), block: b, to: tx.to, sel, name: SEL[sel] ?? sel })
    }
  }
  txs.sort((a, b) => a.nonce - b.nonce)
  console.log('\nwallet transactions in the run window:')
  for (const t of txs) console.log(`  nonce ${t.nonce} block ${t.block} to ${t.to}  ${t.name}`)

  console.log('\nHCA bytecode by block:')
  let firstCodeBlock = null
  for (let b = blockBefore; b <= blockAfter; b++) {
    const code = await H.rpc('eth_getCode', [app.hca, `0x${b.toString(16)}`])
    if (code && code !== '0x' && firstCodeBlock === null) {
      firstCodeBlock = b
      console.log(`  first non-empty at block ${b} (len ${code.length})`)
    }
  }
  if (firstCodeBlock === null) console.log('  never became non-empty (!)')
  else {
    const inBlock = txs.filter((t) => t.block === firstCodeBlock)
    console.log(`  wallet tx(s) in that block: ${inBlock.map((t) => `${t.name}@${t.nonce}`).join(', ') || 'none'}`)
  }

  console.log('\n=== verdict ===')
  console.log(`rendered confirmations : ${summary.confirmations}`)
  console.log(`actual wallet txs      : ${txs.length}`)
  console.log(txs.length === summary.confirmations
    ? 'O2 holds for D=1 — deployment IS its own transaction'
    : `O2 does NOT hold literally for D=1 — ${summary.confirmations} rows vs ${txs.length} txs`)

  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 4).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
