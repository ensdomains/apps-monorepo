import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  labelhash,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { RESOLVER_ABI, setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { localReceipt } from '../../../helpers/local-receipt.js'
import {
  authorizeTransactionsWhile,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import {
  resolveRecords,
  resolverFor,
} from '../../../helpers/resolve-records.js'
import { queryFailures } from '../diagnostics.js'
import {
  connectHeadless,
  expect,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { v2State } from '../probes.js'
import { chainActivity } from '../record-evidence.js'
import {
  account,
  type Configuration,
  seedConfiguration,
  send,
} from '../seed.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const cases = [
  'mixed-supported',
  'mixed-unsupported',
  'zero-resolver',
  'custom-resolver',
  'reject-first',
  'reject-after-setup',
  'stale-owner',
  'stale-resolver',
  'receipt-interruption',
  'flag-before-submit',
  'flag-during-recovery',
  'wallet-capability-change',
]
const abi = parseAbi([
  'function resolver(bytes32 node) view returns(address)',
  'function setResolver(bytes32 node,address resolver)',
  'function transferFrom(address from,address to,uint256 id)',
  'function setOwner(bytes32 node,address owner)',
])

for (const scenario of cases.filter(
  (s) =>
    !process.env.APPROVAL_CASES ||
    process.env.APPROVAL_CASES.split(',').includes(s),
)) {
  test(`approval gate ${scenario}`, async ({ page, wallet }, info) => {
    info.setTimeout(900000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'approval')
    mkdirSync(out, { recursive: true })
    const evidence: Record<string, any> = {
      scenario,
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      scope:
        'Real browser app, fresh fork names, actual transactions; deterministic discovery inventory. Wallet rejection/transport faults are explicitly injected.',
    }
    const save = () =>
      writeFileSync(
        resolve(out, `${scenario}.json`),
        JSON.stringify(
          evidence,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    const c = configs.find(
      (c) =>
        c.config_id ===
        (scenario.startsWith('mixed-') ? 'CFG-0243' : 'CFG-0011'),
    )!
    const f = await seedConfiguration(c)
    const originalRequest = wallet.request.bind(wallet)
    let supportsBatch = true
    let lostReceiptHash: string | undefined
    let blockReceipt = scenario === 'receipt-interruption'
    let blockedReceiptRequests = 0
    const transactions: { hash: string; to?: string; data?: string }[] = []
    wallet.request = (async (request: any) => {
      if (
        blockReceipt &&
        lostReceiptHash &&
        request.method === 'eth_getTransactionReceipt' &&
        request.params?.[0]?.toLowerCase() === lostReceiptHash.toLowerCase()
      ) {
        blockedReceiptRequests++
        throw new Error(
          'Injected wallet RPC receipt outage after actual migration mined',
        )
      }
      if (
        scenario === 'wallet-capability-change' &&
        request.method === 'wallet_getCapabilities'
      ) {
        return {
          '0xaa36a7': {
            atomic: { status: supportsBatch ? 'supported' : 'unsupported' },
          },
        }
      }
      const result = await originalRequest(request)
      if (
        request.method === 'eth_sendTransaction' &&
        typeof result === 'string'
      ) {
        transactions.push({
          hash: result,
          to: request.params?.[0]?.to,
          data: request.params?.[0]?.data,
        })
        if (blockReceipt && !lostReceiptHash) {
          // Return the actual hash only after its local receipt exists, so the
          // fault is armed before the app's first receipt request can win a race.
          const receipt = await localReceipt(result as Hex)
          if (
            receipt.status === 'success' &&
            (await v2State(f.root))?.status === 2
          )
            lostReceiptHash = result
        }
      }
      return result
    }) as typeof wallet.request
    await page.route('**/*', async (route) => {
      const body = route.request().postData() ?? ''
      if (
        blockReceipt &&
        !lostReceiptHash &&
        body.includes('eth_getTransactionReceipt')
      ) {
        // The wallet returns a hash before a timed-mining fork commits it.
        // Observe the actual mined receipt here, when the app requests it.
        const candidate = transactions.find((t) =>
          body.toLowerCase().includes(t.hash.toLowerCase()),
        )
        if (candidate) {
          const receipt = await publicClient
            .getTransactionReceipt({ hash: candidate.hash as Hex })
            .catch(() => null)
          if (
            receipt?.status === 'success' &&
            (await v2State(f.root))?.status === 2
          )
            lostReceiptHash = candidate.hash
        }
      }
      if (
        blockReceipt &&
        lostReceiptHash &&
        body.toLowerCase().includes(lostReceiptHash.toLowerCase()) &&
        body.includes('eth_getTransactionReceipt')
      ) {
        blockedReceiptRequests++
        await route.fulfill({
          status: 503,
          json: {
            error:
              'Injected receipt transport outage after actual migration mined',
          },
        })
      } else await route.fallback()
    })
    const owners = new Map(f.names.map((n) => [n, f.holderFor(n).address]))
    let metadata = await f.metadata()
    try {
      if (scenario.startsWith('mixed-')) {
        const sibling = await makeV1RegistrySubname({
          parentName: f.label,
          childLabel: 'separate',
          ownerAddress: account('W2').address,
          parentOwnerAccount: account('W1'),
          seedLabel: false,
        })
        await setV1RecordsOn(
          sibling,
          account('W2'),
          false,
          f.recordsFor(sibling),
        )
        f.names.push(sibling)
        owners.set(sibling, account('W2').address)
        const add = (name: string, owner: Address) =>
          metadata.push({
            name,
            ownerAddress: owner,
            type: 'unwrapped',
            resolver: V1_PUBLIC_RESOLVER,
            records: {
              texts: [...f.recordsFor(name).texts!],
              addresses: [...f.recordsFor(name).addresses!],
              contentHash: f.recordsFor(name).contenthash,
              abiContentTypes: [1, 2, 4, 8],
              interfaceIds: f
                .recordsFor(name)
                .interfaces!.map((i) => i.interfaceId),
            },
          })
        add(sibling, account('W2').address)
        if (scenario === 'mixed-unsupported') {
          const deep = await makeV1RegistrySubname({
            parentName: sibling.slice(0, -4),
            childLabel: 'deep',
            ownerAddress: account('W3').address,
            parentOwnerAccount: account('W2'),
            seedLabel: false,
          })
          await setV1RecordsOn(deep, account('W3'), false, f.recordsFor(deep))
          f.names.push(deep)
          owners.set(deep, account('W3').address)
          add(deep, account('W3').address)
        }
      }
      if (scenario === 'custom-resolver') {
        // Deploy the already verified public-resolver runtime to a fresh address.
        // It has the same immutable V1 authorization dependencies, but no records.
        const runtime = await publicClient.getCode({
          address: V1_PUBLIC_RESOLVER,
        })
        expect(runtime).toBeTruthy()
        const len = ((runtime!.length - 2) / 2).toString(16).padStart(6, '0')
        const hash = await walletClient.deployContract({
          account: account('W1'),
          abi: [],
          bytecode:
            `0x62${len}601060003962${len}6000f3${runtime!.slice(2)}` as Hex,
        })
        const receipt = await localReceipt(hash)
        expect(receipt.status).toBe('success')
        expect(receipt.contractAddress).toBeTruthy()
        const custom = receipt.contractAddress!
        await send(
          account('W1'),
          V1_ENS_REGISTRY,
          encodeFunctionData({
            abi,
            functionName: 'setResolver',
            args: [namehash(f.leaf), custom],
          }),
        )
        const calls = [
          ...f.records.texts!.map((r) =>
            encodeFunctionData({
              abi: RESOLVER_ABI,
              functionName: 'setText',
              args: [namehash(f.leaf), r.key, r.value],
            }),
          ),
          ...f.records.addresses!.map((r) =>
            encodeFunctionData({
              abi: RESOLVER_ABI,
              functionName: 'setAddr',
              args: [namehash(f.leaf), BigInt(r.coinType), r.value],
            }),
          ),
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: 'setContenthash',
            args: [namehash(f.leaf), f.records.contenthash!],
          }),
          ...f.records.abis!.map((r) =>
            encodeFunctionData({
              abi: RESOLVER_ABI,
              functionName: 'setABI',
              args: [namehash(f.leaf), BigInt(r.contentType), r.data],
            }),
          ),
          ...f.records.interfaces!.map((r) =>
            encodeFunctionData({
              abi: RESOLVER_ABI,
              functionName: 'setInterface',
              args: [namehash(f.leaf), r.interfaceId, r.implementer],
            }),
          ),
        ]
        await send(
          account('W1'),
          custom,
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: 'multicall',
            args: [calls],
          }),
        )
        metadata = metadata.map((n) =>
          n.name === f.leaf ? { ...n, resolver: custom } : n,
        )
        evidence.customResolver = { address: custom, deployment: hash }
      }
      if (scenario === 'zero-resolver') {
        await send(
          account('W1'),
          V1_ENS_REGISTRY,
          encodeFunctionData({
            abi,
            functionName: 'setResolver',
            args: [namehash(f.leaf), zeroAddress],
          }),
        )
        metadata = metadata.map((n) =>
          n.name === f.leaf ? { ...n, resolver: zeroAddress } : n,
        )
      }
      evidence.configuration = c
      evidence.subject = f.leaf
      evidence.names = f.names
      evidence.historySeed = f.historySeed
      const snapshot = async () =>
        Promise.all(
          f.names.map(async (name) => ({
            name,
            state: await v2State(name),
            sourceResolver: await publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi,
              functionName: 'resolver',
              args: [namehash(name)],
            }),
            resolver: await resolverFor(name).catch(
              (e) => String(e).split('\n')[0],
            ),
            records: await resolveRecords(name, f.recordsFor(name)),
          })),
        )
      evidence.before = await snapshot()
      evidence.beforeActivity = await chainActivity(f.startBlock)
      for (const n of evidence.before)
        if (!(scenario === 'zero-resolver' && n.name === f.leaf))
          expect(
            n.records.filter((r: any) => r.want !== r.got),
            `Seed records ${n.name}`,
          ).toEqual([])
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
      await mockV1Names(page, metadata)
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      const rootSelection = rootRow(page, f.root)
      await expect(rootSelection).toBeVisible({ timeout: 90000 })
      if (
        (await rootSelection.isEnabled()) &&
        !(await rootSelection.isChecked())
      )
        await rootSelection.locator('xpath=..').click()
      const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
      evidence.phase = 'preview'
      save()
      if (scenario === 'mixed-unsupported') {
        await expect(
          page
            .getByText(
              /whole tree is not supported|permissions and protections|cannot be preserved|must be included through its parent/i,
            )
            .first(),
        ).toBeVisible({ timeout: 90000 })
        expect(await upgrade.isEnabled().catch(() => false)).toBe(false)
        expect(await snapshot()).toEqual(evidence.before)
      } else {
        await expect(upgrade).toBeEnabled({ timeout: 180000 })
        evidence.preview = await page.locator('body').innerText()
        save()
        const flipFlag = async () =>
          page.evaluate(() =>
            (window as any).posthog.featureFlags.overrideFeatureFlags({
              flags: {
                migration: true,
                'profile-view-new': true,
                'migration-subname-recreation': false,
              },
            }),
          )
        if (scenario === 'stale-owner')
          await send(
            account('W1'),
            V1_BASE_REGISTRAR,
            encodeFunctionData({
              abi,
              functionName: 'transferFrom',
              args: [
                account('W1').address,
                account('W2').address,
                BigInt(labelhash(f.label)),
              ],
            }),
          )
        if (scenario === 'stale-resolver')
          await send(
            account('W1'),
            V1_ENS_REGISTRY,
            encodeFunctionData({
              abi,
              functionName: 'setResolver',
              args: [namehash(f.leaf), zeroAddress],
            }),
          )
        if (scenario === 'flag-before-submit') await flipFlag()
        if (scenario === 'wallet-capability-change') supportsBatch = false
        const refusals = [
          'stale-owner',
          'stale-resolver',
          'flag-before-submit',
          'wallet-capability-change',
        ]
        if (refusals.includes(scenario)) {
          evidence.beforeAttempt = await snapshot()
          if (await upgrade.isEnabled().catch(() => false)) {
            await upgrade.click()
            await expect
              .poll(
                async () =>
                  wallet.getPendingRequestCount(
                    Web3RequestKind.SendTransaction,
                  ) > 0 ||
                  /One of your names changed|permissions changed|not enabled|Subname copying is not available|new preview|couldn.t prepare|Upgrade details:/i.test(
                    await page.locator('body').innerText(),
                  ),
                { timeout: 60000 },
              )
              .toBe(true)
          }
          evidence.pendingTransactions = wallet.getPendingRequestCount(
            Web3RequestKind.SendTransaction,
          )
          expect(
            evidence.pendingTransactions,
            'No wallet submission after stale state/flag refusal',
          ).toBe(0)
          expect(
            await snapshot(),
            'No hidden migration despite refusal',
          ).toEqual(evidence.beforeAttempt)
          const screen = await page.locator('body').innerText()
          expect(screen, 'Visible actionable refusal').toMatch(
            /changed|not enabled|not available|new preview|couldn.t|Upgrade details:/i,
          )
          expect(
            transactions,
            'No transactions accepted after stale preview',
          ).toHaveLength(0)
        } else if (scenario === 'receipt-interruption') {
          let done = false
          const authorizing = authorizeTransactionsWhile(
            page,
            wallet,
            () => done,
          )
          try {
            await upgrade.click()
            await expect
              .poll(
                () => Boolean(lostReceiptHash) && blockedReceiptRequests > 0,
                { timeout: 180000 },
              )
              .toBe(true)
            evidence.minedBeforeReload = await snapshot()
            evidence.lostReceiptHash = lostReceiptHash
            evidence.blockedReceiptRequests = blockedReceiptRequests
            evidence.submittedBeforeReload = [...transactions]
            evidence.journalBeforeReload = await page.evaluate(() =>
              Object.fromEntries(
                Object.entries(localStorage).filter(([key]) =>
                  key.startsWith('ens-apps:atomic-hca-migration:'),
                ),
              ),
            )
          } finally {
            done = true
            await authorizing
          }
          blockReceipt = false
          await page.reload({ waitUntil: 'domcontentloaded' })
          const recovery = page
            .getByRole('button', {
              name: /^(Finish upgrade|Upgrade \d+ names?|Retry|Try again)$/i,
            })
            .first()
          const success = page.getByRole('heading', {
            name: /your names? (has|have) been upgraded/i,
          })
          let recoveryOffered = false
          try {
            await expect
              .poll(
                async () =>
                  (await success.isVisible()) ||
                  (await recovery.isEnabled().catch(() => false)),
                { timeout: 120000 },
              )
              .toBe(true)
            recoveryOffered = true
          } catch {
            /* Record the UI failure without abandoning the independent retention assertions. */
          }
          evidence.checks = {
            'Actual receipt outage injected': {
              result: 'PASS',
              detail: `${blockedReceiptRequests} receipt requests were blocked after the migration transaction mined.`,
            },
            'Completion or recovery offered after reload': {
              result: recoveryOffered ? 'PASS' : 'FAIL',
              detail: await page.locator('body').innerText(),
            },
          }
          expect
            .soft(
              recoveryOffered,
              'A mined migration with a missing receipt should show completion or a recovery action after reload',
            )
            .toBe(true)
          evidence.journalAfterReload = await page.evaluate(() =>
            Object.fromEntries(
              Object.entries(localStorage).filter(([key]) =>
                key.startsWith('ens-apps:atomic-hca-migration:'),
              ),
            ),
          )
          if (recoveryOffered) {
            let finished = false
            const authorizingRecovery = authorizeTransactionsWhile(
              page,
              wallet,
              () => finished,
            )
            try {
              if (!(await success.isVisible())) await recovery.click()
              await expect(success).toBeVisible({ timeout: 180000 })
            } finally {
              finished = true
              await authorizingRecovery
            }
          }
          expect(
            transactions.filter((t) => t.hash === lostReceiptHash),
          ).toHaveLength(1)
          const original = evidence.submittedBeforeReload.find(
            (t: any) => t.hash === lostReceiptHash,
          )
          expect(
            transactions.filter(
              (t) => t.to === original.to && t.data === original.data,
            ),
            'Never resubmit the already mined migration',
          ).toHaveLength(1)
          evidence.checks['No duplicate migration submission'] = {
            result: 'PASS',
            detail:
              'The actual mined transaction hash and original destination/calldata each occur once in the complete wallet submission log.',
          }
        } else if (
          [
            'reject-first',
            'reject-after-setup',
            'flag-during-recovery',
          ].includes(scenario)
        ) {
          await upgrade.click()
          await expect
            .poll(
              () =>
                wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
              { timeout: 120000 },
            )
            .toBeGreaterThan(0)
          let approved = 0
          if (scenario !== 'reject-first') {
            await wallet.authorize(Web3RequestKind.SendTransaction)
            approved++
            await expect
              .poll(
                () =>
                  wallet.getPendingRequestCount(
                    Web3RequestKind.SendTransaction,
                  ),
                { timeout: 120000 },
              )
              .toBeGreaterThan(0)
          }
          await wallet.reject(Web3RequestKind.SendTransaction)
          evidence.interruptedAfterApprovedRequests = approved
          await expect(
            page.getByText(/reject|cancel|declin/i).first(),
          ).toBeVisible({ timeout: 60000 })
          evidence.interruptionUI = await page.locator('body').innerText()
          evidence.afterInterruption = await snapshot()
          for (const n of evidence.afterInterruption)
            expect(n.state?.status).not.toBe(2)
          if (scenario === 'reject-first')
            expect(evidence.afterInterruption).toEqual(evidence.before)
          if (scenario === 'flag-during-recovery') await flipFlag()
          const retry = page
            .getByRole('button', { name: /retry|try again|resume/i })
            .first()
          await expect(retry.or(upgrade).first()).toBeVisible({
            timeout: 60000,
          })
          if (scenario === 'flag-during-recovery') {
            evidence.recoveryJournal = await page.evaluate(() =>
              Object.fromEntries(
                Object.entries(localStorage).filter(([key]) =>
                  key.startsWith('ens-apps:atomic-hca-migration:'),
                ),
              ),
            )
            if (await retry.isVisible()) await retry.click()
            else if (await upgrade.isEnabled()) await upgrade.click()
            evidence.phase =
              'waiting for recovery refusal after disabling recreation'
            save()
            try {
              await expect(
                page
                  .getByText(
                    /not enabled|not available|remaining imports|preserved for later|These subnames can't be preserved yet/i,
                  )
                  .first(),
              ).toBeVisible({ timeout: 180000 })
            } finally {
              evidence.recoveryPendingTransactions =
                wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)
              evidence.recoveryRefusalUI = await page
                .locator('body')
                .innerText()
              evidence.recoverySnapshotAfterRetry = await snapshot()
              save()
            }
            expect(
              wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
            ).toBe(0)
            for (const n of await snapshot())
              expect(n.state?.status).not.toBe(2)
          } else {
            let finished = false
            const authorizingRetry = authorizeTransactionsWhile(
              page,
              wallet,
              () => finished,
            )
            try {
              if (await retry.isVisible()) await retry.click()
              else await upgrade.click()
              await expect(
                page.getByRole('heading', {
                  name: /your names? (has|have) been upgraded/i,
                }),
              ).toBeVisible({ timeout: 180000 })
              evidence.retryOutcome = 'success'
            } finally {
              finished = true
              await authorizingRetry
            }
            if (approved > 0) {
              const completedSetup = transactions[0]
              expect(
                completedSetup,
                'Interrupted case must contain a mined setup submission',
              ).toBeTruthy()
              expect(
                transactions.filter(
                  (t) =>
                    t.to === completedSetup.to &&
                    t.data === completedSetup.data,
                ),
                'Retry must not repeat the already confirmed setup call',
              ).toHaveLength(1)
            }
          }
        } else {
          evidence.outcome = await upgradeAndSettle(page, wallet)
          expect(evidence.outcome).toBe('success')
        }
        if (
          !refusals.includes(scenario) &&
          scenario !== 'flag-during-recovery'
        ) {
          const priorErrorCount = info.errors.length
          for (const n of await snapshot()) {
            expect
              .soft(n.state?.status, `Actual V2 registration ${n.name}`)
              .toBe(2)
            expect
              .soft(
                n.state?.latestOwner.toLowerCase(),
                `Exact holder ${n.name}`,
              )
              .toBe(owners.get(n.name)!.toLowerCase())
            const prior = evidence.before.find((v: any) => v.name === n.name)
            for (const r of n.records) {
              if (scenario === 'zero-resolver' && n.name === f.leaf) {
                // No record resolved before migration. A zero child pointer may
                // now fall back to the parent resolver; it must still be empty.
                expect
                  .soft(
                    ['', '0x', '0:0x', zeroAddress].includes(r.got) ||
                      r.got.startsWith('reverted:'),
                    `${n.name} ${r.what} remains unset`,
                  )
                  .toBe(true)
              } else
                expect
                  .soft(r.got, `${n.name} ${r.what}`)
                  .toBe(prior.records.find((p: any) => p.what === r.what).got)
            }
            if (n.name !== f.root && n.state) {
              const actualPointer = await publicClient.readContract({
                address: n.state.registry,
                abi: parseAbi([
                  'function getResolver(string label) view returns(address)',
                ]),
                functionName: 'getResolver',
                args: [n.state.label],
              })
              expect
                .soft(
                  actualPointer.toLowerCase(),
                  'Recreation preserves the actual V1 registry pointer, including zero; UniversalResolver may use an ancestor',
                )
                .toBe(prior.sourceResolver.toLowerCase())
            }
          }
          if (scenario === 'receipt-interruption')
            evidence.checks[
              'Names, owners, resolver pointers and records retained'
            ] = {
              result: info.errors.length === priorErrorCount ? 'PASS' : 'FAIL',
              detail:
                'Asserted actual V2 registrations, exact original owners, child resolver pointer and every resolved value against the premigration snapshot.',
            }
        }
      }
      evidence.phase = 'complete'
    } catch (error) {
      evidence.error = String(error)
      throw error
    } finally {
      evidence.finalStates = await Promise.all(
        f.names.map(async (name) => ({
          name,
          state: await v2State(name).catch(String),
          records: await resolveRecords(name, f.recordsFor(name)),
        })),
      )
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.submittedTransactions = transactions
      evidence.lostReceiptHash = lostReceiptHash
      evidence.blockedReceiptRequests = blockedReceiptRequests
      evidence.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      evidence.queryFailures = await queryFailures(page)
      evidence.assertionErrors = info.errors.map((e) => e.message)
      evidence.completedAt = new Date().toISOString()
      save()
      await page
        .screenshot({ path: resolve(out, `${scenario}.png`), fullPage: true })
        .catch(() => {})
      await info.attach('approval gate evidence', {
        path: resolve(out, `${scenario}.json`),
        contentType: 'application/json',
      })
    }
  })
}
