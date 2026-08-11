/**
 * Verifies each new state-space preset classifies as the plan predicts, by
 * running the app's own `classifyNames` on the injected subgraph domains.
 *
 * Classification is the oracle here, not "did it migrate" — several of these
 * fixtures exist precisely to test REJECTION, and a rejected name has nothing to
 * migrate. Expectations come from pr-1017-migration-state-space-plan.md.
 */
import * as H from './qa2-lib.mjs'

const CASES = [
  {
    preset: 'Detached',
    id: 'S2',
    expect: { classified: ['locked-2ld', 'detached-child'], ineligible: [] },
  },
  {
    preset: 'Wrapped sub',
    id: 'S3',
    expect: { classified: ['unlocked'], ineligible: ['unlocked-subname'] },
  },
  {
    preset: 'Registry sub',
    id: 'S4',
    // The child is expected to VANISH: bare null, not even an ineligible entry.
    expect: { classified: ['unwrapped'], ineligible: [], childDropped: true },
  },
  {
    preset: 'Locked -xfer',
    id: 'W5',
    expect: { classified: [], ineligible: ['not-transferable'] },
  },
  {
    preset: 'Locked -res',
    id: 'W6',
    expect: { classified: ['locked-2ld'], ineligible: [], strategy: 'keep-v1' },
  },
]

const only = process.argv[2]
const { browser, page, logs } = await H.launch({ headless: true })
const results = []

try {
  for (const c of CASES) {
    if (only && c.preset !== only) continue
    console.log(`\n${'='.repeat(70)}\n${c.id} — ${c.preset}\n${'='.repeat(70)}`)
    const row = { id: c.id, preset: c.preset }
    try {
      const drawer = await H.openMigrationPanel(page)
      await H.clearActiveNames(page, drawer)
      const seeded = await H.seedName(page, drawer, c.preset)
      const parent = (seeded ?? '').split(' ')[0].replace('.eth', '')
      row.seeded = seeded
      console.log('seeded:', seeded)

      const out = await page.evaluate(async () => {
        const body = JSON.stringify({
          operationName: 'getNamesForAddress',
          query:
            'query getNamesForAddress($whereFilter: Domain_filter) { domains(where: $whereFilter) { id } }',
          variables: {
            whereFilter: {
              owner: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            },
          },
        })
        const res = await fetch('https://v1-graphql.ens.dev/subgraph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        const domains = (await res.json())?.data?.domains ?? []
        const m = await import(
          '/@fs/Users/sg/ens/apps-monorepo/packages/migration/src/service/classifyNames.ts'
        )
        const r = m.classifyNames(
          domains,
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        )
        return {
          injected: domains.map((d) => d.name),
          classified: r.classified.map((x) => ({
            name: x.domain?.name,
            tokenType: x.tokenType,
            strategy: x.resolverStrategy,
          })),
          ineligible: r.ineligible.map((x) => ({
            name: x.domain?.name,
            reason: x.reason,
          })),
        }
      })

      const seen = new Set([
        ...out.classified.map((x) => x.name),
        ...out.ineligible.map((x) => x.name),
      ])
      const dropped = out.injected.filter((n) => !seen.has(n))

      row.injected = out.injected
      row.classified = out.classified.map((x) => x.tokenType)
      row.ineligible = out.ineligible.map((x) => x.reason)
      row.strategies = out.classified.map((x) => x.strategy)
      row.dropped = dropped

      console.log('injected   :', out.injected.join(', '))
      console.log('classified :', JSON.stringify(out.classified))
      console.log('ineligible :', JSON.stringify(out.ineligible))
      console.log('DROPPED    :', dropped.length ? dropped.join(', ') : '(none)')

      const tokenOk =
        JSON.stringify([...row.classified].sort()) ===
        JSON.stringify([...c.expect.classified].sort())
      const reasonOk =
        JSON.stringify([...row.ineligible].sort()) ===
        JSON.stringify([...c.expect.ineligible].sort())
      const childDropOk =
        c.expect.childDropped === undefined
          ? true
          : dropped.some((n) => n.startsWith('sub-')) ===
            c.expect.childDropped
      const stratOk = c.expect.strategy
        ? row.strategies.includes(c.expect.strategy)
        : true

      row.pass = tokenOk && reasonOk && childDropOk && stratOk
      console.log(`\nexpected classified: ${JSON.stringify(c.expect.classified)}  -> ${tokenOk ? 'OK' : 'MISMATCH'}`)
      console.log(`expected ineligible: ${JSON.stringify(c.expect.ineligible)}  -> ${reasonOk ? 'OK' : 'MISMATCH'}`)
      if (c.expect.childDropped !== undefined)
        console.log(`expected child silently dropped: ${c.expect.childDropped} -> ${childDropOk ? 'OK' : 'MISMATCH'}`)
      if (c.expect.strategy)
        console.log(`expected strategy ${c.expect.strategy} -> ${stratOk ? 'OK' : 'MISMATCH'} (${row.strategies.join(',')})`)
      console.log(`VERDICT: ${row.pass ? 'PASS' : 'FAIL'}`)

      // What the UI offers, for the record.
      await H.gotoMigrationAll(page, drawer, 18000)
      const s = await H.readSummary(page)
      row.cta = s.upgradeLabel
      row.noEligible = s.noEligible
      console.log(`UI: cta=${s.cta ?? s.upgradeLabel} noEligible=${s.noEligible}`)
    } catch (e) {
      row.error = e.message
      console.log('ERROR:', e.message)
    }
    results.push(row)
  }

  console.log(`\n\n${'#'.repeat(72)}\nSUMMARY\n${'#'.repeat(72)}`)
  console.log('| id | preset | classified | ineligible | dropped | cta | verdict |')
  console.log('|----|--------|-----------|-----------|---------|-----|---------|')
  for (const r of results) {
    console.log(
      `| ${r.id} | ${r.preset} | ${JSON.stringify(r.classified ?? [])} | ${JSON.stringify(r.ineligible ?? [])} | ${(r.dropped ?? []).length} | ${r.cta ?? '-'} | ${r.error ? 'ERR' : r.pass ? 'PASS' : 'FAIL'} |`,
    )
  }
  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} finally {
  await browser.close()
}
