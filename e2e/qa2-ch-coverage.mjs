/**
 * Which record-bearing fixtures actually carry a contenthash?
 *
 * `Records` was verified (unwrapped node). `Subname+Rec` writes to WRAPPED nodes
 * — parent and child — where resolver authorisation goes through the
 * NameWrapper, so it needs its own check. A missing contenthash there would mean
 * the subname contenthash-loss case is silently not being tested.
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const EXPECTED =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f'
const TEXT_KEY = 'description'
const TEXT_VAL = 'QA migration fixture'

const call = async (to, data) =>
  H.rpc('eth_call', [{ to, data }, 'latest'])

const decodeBytes = (raw) => {
  if (!raw || raw === '0x') return null
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len ? `0x${raw.slice(130, 130 + len * 2)}` : null
}
const decodeStr = (raw) => {
  if (!raw || raw === '0x') return ''
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len
    ? Buffer.from(raw.slice(130, 130 + len * 2), 'hex').toString('utf8')
    : ''
}

// contenthash(bytes32) = 0xbc1c58d1 ; text(bytes32,string) = 0x59d1d43c
const chData = (node) => `0xbc1c58d1${node.slice(2)}`
const textData = (node) => {
  const keyHex = Buffer.from(TEXT_KEY, 'utf8').toString('hex')
  return (
    '0x59d1d43c' +
    node.slice(2) +
    (64).toString(16).padStart(64, '0') +
    TEXT_KEY.length.toString(16).padStart(64, '0') +
    keyHex.padEnd(64, '0')
  )
}

const { browser, page, logs } = await H.launch({ headless: true })
try {
  for (const preset of ['Records', 'Subname+Rec']) {
    console.log(`\n${'='.repeat(64)}\n${preset}\n${'='.repeat(64)}`)
    const drawer = await H.openMigrationPanel(page)
    await H.clearActiveNames(page, drawer)
    let seeded
    try {
      seeded = await H.seedName(page, drawer, preset)
    } catch (e) {
      console.log('SEED FAILED (self-check now covers contenthash):', e.message)
      continue
    }
    const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
    const targets = [{ what: 'parent (2LD)', name: `${label}.eth` }]
    if (preset === 'Subname+Rec')
      targets.push({ what: 'child (subname)', name: `sub-${label}.${label}.eth` })

    console.log('seeded:', seeded)
    for (const t of targets) {
      const node = namehash(t.name)
      const ch = decodeBytes(await call(RESOLVER, chData(node)))
      const tx = decodeStr(await call(RESOLVER, textData(node)))
      console.log(`\n  ${t.what} — ${t.name}`)
      console.log(`    text "${TEXT_KEY}" : ${JSON.stringify(tx)} ${tx === TEXT_VAL ? 'OK' : 'MISSING'}`)
      console.log(`    contenthash       : ${ch ? `${ch.slice(0, 26)}…` : 'null'} ${ch === EXPECTED ? 'OK' : 'MISSING'}`)
    }
  }
  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} finally {
  await browser.close()
}
