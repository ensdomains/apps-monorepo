/**
 * Regression sweep over every record-bearing preset after the `custom-resolver`
 * addition. For each: which resolver the records landed on, whether the values
 * are there, and what resolverStrategy the app derives — since that is what
 * decides replay vs keep-v1.
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const RECOGNISED = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const V1_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'

const CASES = [
  { preset: 'Records', expectResolver: 'recognised', expectStrategy: 'to-owned-permres' },
  { preset: 'Custom Res', expectResolver: 'other', expectStrategy: 'keep-v1' },
  { preset: 'Subname+Rec', expectResolver: 'recognised', expectStrategy: 'to-owned-permres' },
]

const call = (to, data) => H.rpc('eth_call', [{ to, data }, 'latest'])
const dStr = (raw) => {
  if (!raw || raw === '0x') return ''
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len ? Buffer.from(raw.slice(130, 130 + len * 2), 'hex').toString('utf8') : ''
}
const dBytes = (raw) => {
  if (!raw || raw === '0x') return null
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len ? `0x${raw.slice(130, 130 + len * 2)}` : null
}
const pad = (n) => n.toString(16).padStart(64, '0')
const textCall = (node, key) =>
  `0x59d1d43c${node.slice(2)}${pad(64)}${pad(key.length)}${Buffer.from(key, 'utf8').toString('hex').padEnd(64, '0')}`

const { browser, page, logs } = await H.launch({ headless: true })
const rows = []
try {
  for (const c of CASES) {
    console.log(`\n${'='.repeat(66)}\n${c.preset}\n${'='.repeat(66)}`)
    const row = { preset: c.preset }
    try {
      const drawer = await H.openMigrationPanel(page)
      await H.clearActiveNames(page, drawer)
      const seeded = await H.seedName(page, drawer, c.preset)
      const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
      row.seeded = seeded
      console.log('seeded:', seeded)

      const node = namehash(`${label}.eth`)
      const resRaw = await call(V1_REGISTRY, `0x0178b8bf${node.slice(2)}`)
      const resolver = resRaw && resRaw !== '0x' ? `0x${resRaw.slice(26)}` : null
      row.resolver = resolver
      row.isRecognised = (resolver ?? '').toLowerCase() === RECOGNISED.toLowerCase()
      const desc = dStr(await call(resolver, textCall(node, 'description')))
      const ch = dBytes(await call(resolver, `0xbc1c58d1${node.slice(2)}`))
      row.hasText = desc.length > 0
      row.hasContenthash = ch !== null
      console.log(`resolver     : ${resolver} ${row.isRecognised ? '(recognised)' : '(NOT recognised)'}`)
      console.log(`text/ch      : text=${row.hasText} contenthash=${row.hasContenthash}`)

      // What strategy does the app derive?
      const out = await page.evaluate(async () => {
        const body = JSON.stringify({
          operationName: 'getNamesForAddress',
          query: 'query getNamesForAddress($whereFilter: Domain_filter) { domains(where: $whereFilter) { id } }',
          variables: { whereFilter: { owner: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' } },
        })
        const res = await fetch('https://v1-graphql.ens.dev/subgraph', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        })
        const domains = (await res.json())?.data?.domains ?? []
        const m = await import('/@fs/Users/sg/ens/apps-monorepo/packages/migration/src/service/classifyNames.ts')
        const r = m.classifyNames(domains, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
        return r.classified.map((x) => ({ name: x.domain?.name, tokenType: x.tokenType, strategy: x.resolverStrategy, resolver: x.v1ResolverAddress }))
      })
      row.classified = out
      console.log('classified   :', JSON.stringify(out))
      const strat = out.find((x) => x.name === `${label}.eth`)?.strategy
      row.strategy = strat
      row.strategyOk = strat === c.expectStrategy
      console.log(`strategy     : ${strat} (expected ${c.expectStrategy}) -> ${row.strategyOk ? 'OK' : 'MISMATCH'}`)
      row.pass = row.hasText && row.hasContenthash && row.strategyOk
    } catch (e) {
      row.error = e.message
      console.log('ERROR:', e.message)
    }
    rows.push(row)
  }

  console.log(`\n\n${'#'.repeat(70)}\nSUMMARY\n${'#'.repeat(70)}`)
  console.log('| preset | resolver recognised | text | contenthash | strategy | verdict |')
  console.log('|--------|--------------------|------|-------------|----------|---------|')
  for (const r of rows) {
    console.log(`| ${r.preset} | ${r.isRecognised ?? '-'} | ${r.hasText ?? '-'} | ${r.hasContenthash ?? '-'} | ${r.strategy ?? '-'} | ${r.error ? 'ERR' : r.pass ? 'PASS' : 'FAIL'} |`)
  }
  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} finally {
  await browser.close()
}
