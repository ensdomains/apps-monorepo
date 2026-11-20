import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import { V1_PUBLIC_RESOLVER } from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  authorizeTransactionsWhile,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import {
  type MockV1Name,
  mockV1Names,
} from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import {
  connectHeadless,
  expect,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { v2State } from '../probes.js'
import { chainActivity } from '../record-evidence.js'
import { account, type Configuration, seedConfiguration } from '../seed.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
test('approval partial multi-tree batch resumes without duplicate registration', async ({
  page,
  wallet,
}, info) => {
  info.setTimeout(1800000)
  const out = resolve(process.env.REPLACEMENT_RESULTS!, 'approval')
  mkdirSync(out, { recursive: true })
  const e: Record<string, any> = {
    startedAt: new Date().toISOString(),
    phase: 'fixture',
    scope:
      'Six fresh affected trees; normal gas-based partitioning; explicitly reject the next wallet request after at least one whole tree commits. Verify recovery and no partial affected tree.',
  }
  const save = () =>
    writeFileSync(
      resolve(out, 'partial-tree.json'),
      JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? String(v) : v), 2),
    )
  const start = await publicClient.getBlockNumber({ cacheTime: 0 })
  const fixtures: Awaited<ReturnType<typeof seedConfiguration>>[] = []
  const inventory: MockV1Name[] = []
  try {
    for (let i = 0; i < 6; i++) {
      const f = await seedConfiguration({
        ...configs.find((c) => c.config_id === 'CFG-0011')!,
        config_id: `apr26-${i}`,
      })
      fixtures.push(f)
      inventory.push(...(await f.metadata()))
      for (let j = 0; j < 9; j++) {
        const name = await makeV1RegistrySubname({
          parentName: f.label,
          childLabel: `sibling${j}`,
          ownerAddress: account('W1').address,
          parentOwnerAccount: account('W1'),
          seedLabel: false,
        })
        await setV1RecordsOn(name, account('W1'), false, f.recordsFor(name))
        f.names.push(name)
        const r = f.recordsFor(name)
        inventory.push({
          name,
          ownerAddress: account('W1').address,
          type: 'unwrapped',
          resolver: V1_PUBLIC_RESOLVER,
          records: {
            texts: [...r.texts!],
            addresses: [...r.addresses!],
            contentHash: r.contenthash,
            abiContentTypes: r.abis!.map((a) => a.contentType),
            interfaceIds: r.interfaces!.map((a) => a.interfaceId),
          },
        })
      }
    }
    const names = fixtures.flatMap((f) => f.names)
    e.names = names
    e.roots = fixtures.map((f) => f.root)
    e.beforeRecords = []
    for (const f of fixtures)
      for (const name of f.names) {
        const records = await resolveRecords(name, f.recordsFor(name))
        e.beforeRecords.push({ name, records })
        expect(
          records.filter((r) => r.want !== r.got),
          `Seed ${name}`,
        ).toEqual([])
      }
    e.beforeActivity = await chainActivity(start)
    await page.clock.install({
      time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000),
    })
    await overrideManagerFeatureFlags(page, {
      migration: true,
      'profile-view-new': true,
      'migration-subname-recreation': true,
    })
    await mockV1Names(page, inventory)
    await connectHeadless(page, wallet)
    await dismissBackendAuthModal(page, { timeout: 3000 })
    await openMigrationFlow(page)
    await selectOnlyRoots(
      page,
      fixtures.map((f) => f.root),
    )
    const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
    await expect(upgrade).toBeEnabled({ timeout: 180000 })
    e.preview = await page.locator('body').innerText()
    e.phase = 'first execution'
    save()
    const submitted: { hash: string; to: string; data: string }[] = []
    const original = wallet.request.bind(wallet)
    wallet.request = (async (request: any) => {
      const result = await original(request)
      if (
        request.method === 'eth_sendTransaction' &&
        typeof result === 'string'
      )
        submitted.push({
          hash: result,
          to: request.params[0].to,
          data: request.params[0].data,
        })
      return result
    }) as typeof wallet.request
    await upgrade.click()
    let interrupted = false
    for (let step = 0; step < 40; step++) {
      await expect
        .poll(
          () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
          { timeout: 180000 },
        )
        .toBeGreaterThan(0)
      const states = await Promise.all(
        names.map(async (name) => ({ name, state: await v2State(name) })),
      )
      const migrated = states.filter((s) => s.state?.status === 2)
      if (migrated.length > 0 && migrated.length < names.length) {
        e.partialStates = states
        e.transactionsBeforeInterruption = [...submitted]
        for (const f of fixtures) {
          const count = states.filter(
            (s) => f.names.includes(s.name) && s.state?.status === 2,
          ).length
          expect(count, `Affected tree must be all-or-nothing: ${f.root}`).toBe(
            count ? f.names.length : 0,
          )
        }
        await wallet.reject(Web3RequestKind.SendTransaction)
        interrupted = true
        break
      }
      await wallet.authorize(Web3RequestKind.SendTransaction)
    }
    expect(
      interrupted,
      'Must observe actual partial selection completion; a single fully committed batch is not this test',
    ).toBe(true)
    await expect(page.getByText(/reject|cancel|declin/i).first()).toBeVisible({
      timeout: 60000,
    })
    e.phase = 'recovery'
    e.interruptedUI = await page.locator('body').innerText()
    save()
    const retry = page
      .getByRole('button', { name: /retry|try again|resume/i })
      .first()
    await expect(retry).toBeVisible({ timeout: 60000 })
    let done = false
    const authorize = authorizeTransactionsWhile(page, wallet, () => done)
    try {
      await retry.click()
      // Some recoveries return to selection; others immediately resume the saved plan.
      if (await upgrade.isVisible().catch(() => false)) await upgrade.click()
      await expect(
        page.getByRole('heading', {
          name: /your names? (has|have) been upgraded/i,
        }),
      ).toBeVisible({ timeout: 300000 })
    } finally {
      done = true
      await authorize
    }
    e.transactions = submitted
    for (const old of e.transactionsBeforeInterruption)
      expect(
        submitted.filter((t) => t.to === old.to && t.data === old.data),
        `Completed submission must not repeat ${old.hash}`,
      ).toHaveLength(1)
    e.after = []
    for (const f of fixtures)
      for (const name of f.names) {
        const state = await v2State(name),
          records = await resolveRecords(name, f.recordsFor(name))
        e.after.push({ name, state, records })
        expect.soft(state?.status, name).toBe(2)
        expect
          .soft(state?.latestOwner.toLowerCase(), name)
          .toBe(account('W1').address.toLowerCase())
        for (const r of records)
          expect.soft(r.got, `${name}: ${r.what}`).toBe(r.want)
      }
    e.phase = 'complete'
  } catch (error) {
    e.error = String(error)
    throw error
  } finally {
    e.afterActivity = await chainActivity(start)
    e.finalUI = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    e.completedAt = new Date().toISOString()
    e.assertionErrors = info.errors.map((x) => x.message)
    save()
    await info.attach('partial completion evidence', {
      path: resolve(out, 'partial-tree.json'),
      contentType: 'application/json',
    })
  }
})
