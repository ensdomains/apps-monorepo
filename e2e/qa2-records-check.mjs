/**
 * Inspect a name's records on BOTH sides of migration.
 *
 *   node e2e/qa2-records-check.mjs dev8354.eth
 *
 * Answers "does this fixture actually have records, and did migration keep
 * them" without going through any UI — the app's profile page for an
 * un-migrated V1 name reads V2 state, so it shows nothing even when the V1
 * records are present, which looks exactly like a broken fixture.
 */
import { namehash } from 'viem/ens'

const RPC = 'http://127.0.0.1:8545'
const V1_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const RESOLVERS = {
  'recognised (record presets)': '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
  'unrecognised (custom-res preset)': '0x179A862703a4adfb29896552DF9e307980D19285',
  'older panel resolver': '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
}
const TEXT_KEYS = ['description', 'com.twitter']
const COIN_ETH = 60

const rpc = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(`${method}: ${j.error.message}`)
  return j.result
}
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest'])

const dStr = (raw) => {
  if (!raw || raw === '0x') return ''
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len
    ? Buffer.from(raw.slice(130, 130 + len * 2), 'hex').toString('utf8')
    : ''
}
const dBytes = (raw) => {
  if (!raw || raw === '0x') return null
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len ? `0x${raw.slice(130, 130 + len * 2)}` : null
}
const pad = (n) => n.toString(16).padStart(64, '0')

const textCall = (node, key) =>
  `0x59d1d43c${node.slice(2)}${pad(64)}${pad(key.length)}${Buffer.from(key, 'utf8').toString('hex').padEnd(64, '0')}`
const addrCall = (node) => `0xf1cb7e06${node.slice(2)}${pad(COIN_ETH)}`
const chCall = (node) => `0xbc1c58d1${node.slice(2)}`

const name = process.argv[2]
if (!name) {
  console.error('usage: node e2e/qa2-records-check.mjs <name.eth>')
  process.exit(1)
}
const node = namehash(name)
console.log(`${name}\n  namehash: ${node}\n`)

// Which resolver does the V1 registry point at?
const resRaw = await call(V1_REGISTRY, `0x0178b8bf${node.slice(2)}`)
const v1Resolver =
  resRaw && resRaw !== '0x' ? `0x${resRaw.slice(26)}` : null
const known = Object.entries(RESOLVERS).find(
  ([, a]) => a.toLowerCase() === (v1Resolver ?? '').toLowerCase(),
)
console.log(`V1 registry resolver: ${v1Resolver ?? '(none set)'}${known ? `  <- ${known[0]}` : v1Resolver ? '  <- unknown to this script' : ''}`)

if (!v1Resolver || /^0x0+$/.test(v1Resolver)) {
  console.log('\nNo V1 resolver -> this name genuinely has no records.')
  process.exit(0)
}

console.log('\n--- records on the V1 resolver ---')
let any = false
for (const key of TEXT_KEYS) {
  const v = dStr(await call(v1Resolver, textCall(node, key)))
  if (v) any = true
  console.log(`  text ${key.padEnd(12)}: ${v ? JSON.stringify(v) : '(empty)'}`)
}
const addr = dBytes(await call(v1Resolver, addrCall(node)))
const ch = dBytes(await call(v1Resolver, chCall(node)))
if (addr || ch) any = true
console.log(`  addr(60)      : ${addr ?? '(none)'}`)
console.log(`  contenthash   : ${ch ?? '(none)'}`)

console.log(
  any
    ? '\n=> The fixture DOES have V1 records. If the app shows none, you are looking\n   at V2 state: the manager profile page reads the V2 registry/resolver, so an\n   un-migrated V1 name legitimately shows nothing there. Records only become\n   visible in the app AFTER migration.'
    : '\n=> No records found on the V1 resolver — the fixture really is empty.',
)

if (ch) {
  console.log(
    '\nNote: contenthash is NOT carried by migration (Profile is only texts +\n' +
      'addresses), so expect it to be absent after migrating. See\n' +
      'pr-1017-migration-state-space-plan.md finding 1.',
  )
}
