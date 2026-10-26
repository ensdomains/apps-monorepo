import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Address, encodeFunctionData, namehash, parseAbi } from 'viem'
import { computeStandaloneHcaAddress } from '../../../../packages/smart-account/src/providers/rhinestone/initialize-account.js'
import { V1_ENS_REGISTRY } from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  authorizeTransactionsWhile,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  UPGRADE_OUTCOMES,
} from '../../../helpers/migration-flow.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import {
  connectHeadless,
  expect,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { v2State } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import {
  account,
  type Configuration,
  seedConfiguration,
  send,
} from '../seed.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const scenarios = [
  { id: 'record-before-submit', config: 'CFG-0003', timing: 'preview' },
  { id: 'record-at-signing', config: 'CFG-0003', timing: 'signing' },
  { id: 'child-owner-at-signing', config: 'CFG-0015', timing: 'signing' },
  { id: 'child-added-at-signing', config: 'CFG-0035', timing: 'signing' },
]

for (const scenario of scenarios) {
  test(`priority source race ${scenario.id} ${scenario.config}`, async ({
    page,
    wallet,
  }, info) => {
    info.setTimeout(600000)
    const c = configs.find((value) => value.config_id === scenario.config)
    if (!c || c.level === '4LD')
      throw new Error('Expected an included 2LD/3LD configuration')
    const output = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(output, { recursive: true })
    const evidence: Record<string, unknown> = {
      id: scenario.id,
      configurations: [c.config_id],
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      checks: {},
      scope:
        'Real Manager migration and independent V1 mutation. Confirmed MIGRATION-SOURCE-01 requires atomic refusal and a fresh review after source changes. Latest records and controllers are independently measured. Discovery is the reviewed seeded inventory, not a claim of live indexer discovery.',
    }
    const checks: Record<string, unknown> = {}
    evidence.checks = checks
    const save = () =>
      writeFileSync(
        resolve(output, `${scenario.id}.json`),
        JSON.stringify(
          evidence,
          (_key, value) => (typeof value === 'bigint' ? String(value) : value),
          2,
        ),
      )
    const f = await seedConfiguration(c)
    const hca = computeStandaloneHcaAddress({
      chainId: 11155111,
      owner: account(c.root_owner).address,
    })
    let mutated = false
    let addedName: string | undefined
    const changedDescription = `Updated by a separate wallet after preview: ${f.root}`
    const mutation = async () => {
      evidence.mutationBlockBefore = (await publicClient.getBlock()).number
      if (scenario.id.startsWith('record-')) {
        await setV1RecordsOn(f.root, account(c.root_manager), false, {
          texts: [{ key: 'description', value: changedDescription }],
        })
        const actual = await sourceRecords(f.root, {
          texts: [{ key: 'description', value: changedDescription }],
        })
        expect(actual[0].got).toBe(changedDescription)
        evidence.mutation = { name: f.root, actor: c.root_manager, actual }
      } else if (scenario.id === 'child-owner-at-signing') {
        const receipt = await send(
          account('W2'),
          V1_ENS_REGISTRY,
          encodeFunctionData({
            abi: parseAbi(['function setOwner(bytes32 node,address owner)']),
            functionName: 'setOwner',
            args: [namehash(f.leaf), account('W3').address],
          }),
        )
        const owner = await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function owner(bytes32 node) view returns(address)']),
          functionName: 'owner',
          args: [namehash(f.leaf)],
        })
        expect(owner.toLowerCase()).toBe(account('W3').address.toLowerCase())
        evidence.mutation = {
          name: f.leaf,
          previousOwner: account('W2').address,
          newOwner: owner,
          hash: receipt.transactionHash,
        }
      } else {
        addedName = await makeV1RegistrySubname({
          parentName: f.label,
          childLabel: 'added',
          ownerAddress: account('W3').address,
          parentOwnerAccount: account(c.root_manager),
          seedLabel: false,
        })
        await setV1RecordsOn(
          addedName,
          account('W3'),
          false,
          f.recordsFor(addedName),
        )
        const records = await resolveRecords(addedName, f.recordsFor(addedName))
        expect(records.filter((record) => record.got !== record.want)).toEqual(
          [],
        )
        evidence.mutation = {
          name: addedName,
          actor: c.root_manager,
          records,
        }
      }
      mutated = true
      evidence.mutationBlockAfter = (await publicClient.getBlock()).number
      save()
    }
    const originalRequest = wallet.request.bind(wallet)
    wallet.request = (async (request) => {
      if (
        scenario.timing === 'signing' &&
        !mutated &&
        request.method === 'eth_sendTransaction'
      ) {
        const params = request.params as readonly {
          to?: Address
          data?: string
        }[]
        if (params[0]?.to?.toLowerCase() === hca.toLowerCase()) {
          evidence.interceptedTransaction = {
            to: params[0].to,
            selector: params[0].data?.slice(0, 10),
            stage:
              'App has requested the migration transaction; mutate before the headless wallet submits it.',
          }
          await mutation()
        }
      }
      return originalRequest(request)
    }) as typeof wallet.request
    try {
      evidence.subject = f.leaf
      evidence.names = f.names
      evidence.beforeActivity = await chainActivity(f.startBlock)
      evidence.before = await Promise.all(
        f.names.map(async (name) => ({
          name,
          records: await resolveRecords(name, f.recordsFor(name)),
        })),
      )
      for (const value of evidence.before as {
        name: string
        records: Awaited<ReturnType<typeof resolveRecords>>
      }[]) {
        expect(
          value.records.filter((record) => record.got !== record.want),
          `Readable baseline for ${value.name}`,
        ).toEqual([])
      }
      await page.clock.install({
        time: new Date(
          Number((await publicClient.getBlock()).timestamp) * 1000,
        ),
      })
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'profile-view-new': true,
        'migration-subname-recreation': true,
      })
      await mockV1Names(page, await f.metadata())
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      const selection = rootRow(page, f.root)
      await expect(selection).toBeEnabled({ timeout: 90000 })
      if (!(await selection.isChecked()))
        await selection.locator('xpath=..').click()
      await expect(selection).toBeChecked()
      if (c.retain_manager === 'Keep')
        await page
          .getByRole('checkbox', { name: /Keep .* as a manager/ })
          .check()
      await expect(
        page.getByRole('button', { name: /^Upgrade \d+ names?$/ }),
      ).toBeEnabled({ timeout: 180000 })
      evidence.preview = await page.locator('body').innerText()
      if (scenario.timing === 'preview') await mutation()
      evidence.phase = 'migration with source mutation'
      save()
      // Deliberately do not acknowledge a second review: that is the expected guard.
      let settled: string | null = null
      const authorizing = authorizeTransactionsWhile(
        page,
        wallet,
        () => settled !== null,
      )
      await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).click()
      const deadline = Date.now() + 180000
      while (!settled && Date.now() < deadline) {
        if (
          await page
            .getByRole('dialog')
            .filter({ hasText: 'Your subnames are unaffected' })
            .isVisible()
            .catch(() => false)
        )
          settled = 'freshReview'
        for (const [outcome, pattern] of Object.entries(UPGRADE_OUTCOMES)) {
          if (
            !settled &&
            (await page
              .getByText(pattern)
              .first()
              .isVisible()
              .catch(() => false))
          )
            settled = outcome
        }
        if (!settled) await page.waitForTimeout(500)
      }
      settled ??= 'generic'
      await Promise.race([authorizing, page.waitForTimeout(5000)])
      evidence.migrationOutcome = settled
      evidence.acceptanceRule = 'MIGRATION-SOURCE-01'
      const freshReviewRequested = [
        'freshReview',
        'ownerChanged',
        'planChanged',
      ].includes(settled)
      checks['Source change prompts a fresh review'] = {
        result: freshReviewRequested ? 'PASS' : 'FAIL',
        outcome: settled,
      }
      expect
        .soft(
          freshReviewRequested,
          'Source changes must stop and require a fresh review',
        )
        .toBe(true)
      expect(
        mutated,
        'The intended source mutation must actually execute',
      ).toBe(true)
      const migrated = (await v2State(f.root))?.status === 2
      const allNames = [...f.names, ...(addedName ? [addedName] : [])]
      const expectedRecords = (name: string) =>
        scenario.id.startsWith('record-') && name === f.root
          ? {
              ...f.recordsFor(name),
              texts: f
                .recordsFor(name)
                .texts?.map((record) =>
                  record.key === 'description'
                    ? { ...record, value: changedDescription }
                    : record,
                ),
            }
          : f.recordsFor(name)
      const after = await Promise.all(
        allNames.map(async (name) => ({
          name,
          state: await v2State(name),
          records: await resolveRecords(name, expectedRecords(name)),
          source: await sourceRecords(name, expectedRecords(name)),
          sourceOwner: await publicClient.readContract({
            address: V1_ENS_REGISTRY,
            abi: parseAbi([
              'function owner(bytes32 node) view returns(address)',
            ]),
            functionName: 'owner',
            args: [namehash(name)],
          }),
        })),
      )
      evidence.after = after
      evidence.migrated = migrated
      checks['Migration stops after the source changes'] = {
        result: migrated ? 'FAIL' : 'PASS',
        migrated,
      }
      expect
        .soft(migrated, 'The name must not migrate using a superseded review')
        .toBe(false)
      for (const value of after) {
        expect
          .soft(
            value.state?.status,
            `No partial migration after source change: ${value.name}`,
          )
          .not.toBe(2)
        const mismatches = value.records.filter(
          (record) => record.got !== record.want,
        )
        checks[`Latest records remain publicly readable: ${value.name}`] = {
          result: mismatches.length ? 'FAIL' : 'PASS',
          mismatches,
        }
        expect
          .soft(
            mismatches,
            `Latest source records must remain available for ${value.name}`,
          )
          .toEqual([])
        if (migrated) {
          expect
            .soft(value.state?.status, `No omitted name: ${value.name}`)
            .toBe(2)
          if (
            value.name === addedName ||
            (scenario.id === 'child-owner-at-signing' && value.name === f.leaf)
          )
            expect
              .soft(
                value.state?.latestOwner.toLowerCase(),
                'Migration must not silently discard the newer controller',
              )
              .toBe(account('W3').address.toLowerCase())
        } else {
          expect
            .soft(value.state?.status, `No partial migration: ${value.name}`)
            .not.toBe(2)
          if (
            value.name === addedName ||
            (scenario.id === 'child-owner-at-signing' && value.name === f.leaf)
          )
            expect
              .soft(
                value.sourceOwner.toLowerCase(),
                'Refusal must leave the newer V1 controller intact',
              )
              .toBe(account('W3').address.toLowerCase())
        }
      }
      checks[
        'Atomic refusal, fresh review, and preservation of latest source state'
      ] = {
        result: info.errors.length ? 'FAIL' : 'PASS',
        migrated,
        outcome: evidence.migrationOutcome,
      }
      evidence.phase = 'completed'
    } catch (error) {
      evidence.error = String(error)
      throw error
    } finally {
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      evidence.assertionErrors = info.errors.map((error) => error.message)
      evidence.completedAt = new Date().toISOString()
      save()
      await page
        .screenshot({
          path: resolve(output, `${scenario.id}.png`),
          fullPage: true,
        })
        .catch(() => {})
    }
  })
}
