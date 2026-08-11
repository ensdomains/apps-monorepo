/**
 * O2 audit — a clean single-name migration that records every wallet
 * transaction between the nonce samples, with selectors decoded.
 *
 * Exists because an R3 run reported nonceDelta=4 against a 1-confirmation plan,
 * after 13/13 exact matches earlier. Either the plan under-reports
 * confirmations, or that run's measurement was contaminated. This settles it.
 */
import * as H from './qa2-lib.mjs'

const SELECTORS = {
  '0xfca247ac': 'BaseRegistrar.register',
  '0xa22cb465': 'setApprovalForAll',
  '0x095ea7b3': 'ERC721.approve',
  '0x1cff79cd': 'executeByOwner?',
  '0xb88d4fde': 'safeTransferFrom(data)',
  '0x2eb2c2d6': 'safeBatchTransferFrom',
  '0xf242432a': 'safeTransferFrom(1155)',
}

const walletTxsBetween = async (fromBlock, toBlock) => {
  const out = []
  for (let b = fromBlock; b <= toBlock; b++) {
    const blk = await H.rpc('eth_getBlockByNumber', [`0x${b.toString(16)}`, true])
    for (const tx of blk?.transactions ?? []) {
      if ((tx.from ?? '').toLowerCase() === H.WALLET.toLowerCase()) {
        const sel = (tx.input ?? '').slice(0, 10)
        out.push({
          nonce: Number.parseInt(tx.nonce, 16),
          block: b,
          to: tx.to,
          sel,
          name: SELECTORS[sel] ?? sel,
        })
      }
    }
  }
  return out.sort((a, b) => a.nonce - b.nonce)
}

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Unwrapped')
  console.log('seeded:', seeded)

  const before = await H.readChainState(app)
  console.log('state before:', {
    hca: before.hcaDeployed, base: before.baseRegistrarApproved,
    wrap: before.nameWrapperApproved, reg: before.ethRegistryApproved,
  })
  const expected = H.predict({ state: before, unwrapped: 1 })
  console.log('O1 predicted:', expected.n, expected.rows)

  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)
  console.log('rendered    :', summary.confirmations, dialog.kinds, `fee=${summary.fee}`)

  const blockBefore = Number.parseInt(await H.rpc('eth_blockNumber', []), 16)
  const nb = await H.nonceOf()
  const r = await H.runMigration(page)
  const na = await H.nonceOf()
  const blockAfter = Number.parseInt(await H.rpc('eth_blockNumber', []), 16)

  console.log('\nmigration   :', r.ok ? 'SUCCESS' : 'FAIL')
  console.log(`O2 nonce    : ${nb} -> ${na} = ${na - nb} (predicted ${expected.n})`)
  console.log(`blocks      : ${blockBefore} -> ${blockAfter}`)

  const txs = await walletTxsBetween(blockBefore, blockAfter)
  console.log('\nwallet transactions in that window:')
  for (const t of txs) {
    const flag = t.nonce >= nb && t.nonce < na ? ' <== counted' : ''
    console.log(`  nonce ${t.nonce} block ${t.block} to ${t.to} ${t.name}${flag}`)
  }
  const counted = txs.filter((t) => t.nonce >= nb && t.nonce < na)
  console.log(`\ncounted ${counted.length} tx(s) vs predicted ${expected.n}`)
  console.log('verdict:', counted.length === expected.n
    ? 'O2 MATCH'
    : `O2 MISMATCH — extra: ${counted.map((c) => c.name).join(', ')}`)

  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 4).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
