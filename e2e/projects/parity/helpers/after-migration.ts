// Audit fixtures are created independently; no excluded legacy stateful suite is imported.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import type { Page } from '@playwright/test'
import { type Address, labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import {
  MIGRATION_FEATURE_FLAGS,
  overrideManagerFeatureFlags,
  PROFILE_FEATURE_FLAGS,
} from '../../../fixtures/playwright.manager.fixture.js'
import {
  makeGraceV1Name,
  syncBrowserToChain,
} from '../../../fixtures/record-audit-grace.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { fundTestUsdc } from '../../../helpers/fund-test-usdc.js'
import { readV2NameStatus } from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { createBignameMock } from '../../../helpers/mock-bigname.js'
import {
  type MockV1Name,
  mockV1Names,
} from '../../../helpers/record-audit-inventory.js'
import {
  resolveRecords,
  resolverFor,
} from '../../../helpers/resolve-records.js'
import { readNameRoles } from '../../../helpers/role-assertions.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { retryCurrentOutOfGas } from '../../replacement/helpers/gas-recovery.js'
import { checkMigratedDates } from '../../replacement/helpers/migrated-dates.js'
import { type LegacyName, seedLegacyTree } from '../helpers/legacy-tree.js'
import cases from '../ownership-cases.json' with { type: 'json' }
export type Action = 'migration' | 'send' | 'edit' | 'roles' | 'sync' | 'dates'
export function registerAfterMigrationChecks(
  actions: readonly Action[],
  rows?: readonly number[],
  gasRecovery = false,
) {
  const groups = [
    [85, 88],
    [89, 92],
    [93, 95],
    [96, 98],
    [99, 102],
    [103, 106],
    [107, 110],
    [111, 114],
    [115, 118],
    [119, 122],
    [123, 126],
    [127, 130],
    [131, 134],
    [135, 136],
    [137, 140],
    [141, 144],
    [145, 148],
    [149, 152],
    [153, 154],
    [155, 158],
    [159, 162],
  ]
  type Result = { status: string; detail: string; error?: string }
  type Audit = {
    row: number
    scenario: string
    name?: string
    root?: string
    fixture?: unknown
    migration?: string
    v2Status?: unknown
    before?: unknown
    after?: unknown
    checks: Record<string, Result>
    observations: Record<string, unknown>
    error?: string
  }
  async function targetOf(name: string) {
    let registryAddress = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
      .address as Address
    const labels = name.split('.').slice(0, -1).reverse()
    for (const label of labels.slice(0, -1))
      registryAddress = await publicClient.readContract({
        address: registryAddress,
        abi: parseAbi([
          'function getSubregistry(string) view returns(address)',
        ]),
        functionName: 'getSubregistry',
        args: [label],
      })
    return { registryAddress, label: labels.at(-1)! }
  }
  const short = (e: unknown) => String(e).slice(0, 1800)
  for (const [index, [start, end]] of groups.entries()) {
    if (rows && !rows.includes(index + 1)) continue
    for (const action of actions) {
      const source = cases.find(
        (c) => Number(c.id.slice(1)) >= start && Number(c.id.slice(1)) <= end,
      )!
      test(`AM${String(index + 1).padStart(2, '0')} ${action}${gasRecovery ? ' gas-recovery' : ''} ${source.title.split(' > ')[0]}`, async ({
        manager,
        explorer,
        accounts,
      }, info) => {
        const DIR = info.outputPath('evidence')
        mkdirSync(DIR, { recursive: true })
        const id = `AM${String(index + 1).padStart(2, '0')}`
        const a: Audit = {
          row: index + 1,
          scenario: source.title.split(' > ')[0],
          fixture: source.config,
          checks: {},
          observations: {},
        }
        const consoleLines: string[] = []
        explorer.page.on('console', (m) => {
          if (/Transaction|Error|error/.test(m.text()))
            consoleLines.push(m.text())
        })
        const save = () =>
          writeFileSync(join(DIR, id + '.json'), JSON.stringify(a, null, 2))
        const shot = async (page: Page, stage: string) => {
          writeFileSync(
            join(DIR, id + '-' + stage + '.txt'),
            await page.locator('body').innerText(),
          )
          await page.screenshot({
            path: join(DIR, id + '-' + stage + '.png'),
            fullPage: true,
          })
        }
        const run = async (key: Action, fn: () => Promise<Result>) => {
          if (key !== action) return
          try {
            a.checks[key] = await fn()
          } catch (e) {
            a.checks[key] = {
              status: 'BLOCKED',
              detail: 'Attempt did not reach a verified outcome',
              error: short(e),
            }
            await shot(explorer.page, key + '-blocked').catch(() => {})
          }
          a.observations.transactionLog = consoleLines
          save()
          const result = a.checks[key]
          expect
            .soft(
              ['PASS', 'PASS WITH WORKAROUND', 'N/A'],
              `${key}: ${result.detail} ${result.error ?? ''}`,
            )
            .toContain(result.status)
        }
        const originalConfig = source.config as LegacyName
        // Legacy L132's extracted fixture contradicts its wrapped-child/manager-only title. Match the requested matrix scenario explicitly.
        const config: LegacyName =
          start === 131
            ? {
                label: 'unwrapped',
                type: 'legacy',
                owner: 'user2',
                subnames: [{ label: 'test', type: 'wrapped', owner: 'user' }],
              }
            : originalConfig
        a.fixture = config
        if (start === 131)
          a.observations.fixtureCorrection =
            'Wrapped child under unwrapped root; connected wallet holds child only. Extracted legacy sync fixture incorrectly used an unwrapped same-wallet child.'
        const ownerUser = config.owner ?? 'user'
        const owner = privateKeyToAccount(accounts.getPrivateKey(ownerUser))
        try {
          const mock = createBignameMock()
          await mock.install(manager.page)
          await mock.install(explorer.page)
          await overrideManagerFeatureFlags(manager.page, {
            ...MIGRATION_FEATURE_FLAGS,
            ...PROFILE_FEATURE_FLAGS,
          })
          let root: string, name: string
          if (config.duration && config.duration < 0) {
            const grace = await makeGraceV1Name({
              label: id.toLowerCase(),
              owner,
              wrapped: config.type === 'wrapped',
              beforeExpiry: async (n) => {
                await setV1RecordsOn(n, owner, config.type === 'wrapped', {
                  texts: [{ key: 'description', value: `${id} baseline` }],
                  addresses: [
                    { coinType: 60, value: accounts.getAddress('user') },
                  ],
                })
              },
            })
            root = grace.name
            name = root
            await syncBrowserToChain(manager.page)
            await fundTestUsdc(owner.address)
          } else {
            const tree = await seedLegacyTree(config, id, accounts)
            root = tree.root
            name = tree.name
          }
          a.name = name
          a.root = root
          a.observations.startBlock = String(
            await publicClient.getBlockNumber({ cacheTime: 0 }),
          )
          save()
          const names: string[] = []
          let path = name
          while (path.endsWith('.eth') && path !== 'eth') {
            names.unshift(path)
            path = path.split('.').slice(1).join('.')
          }
          const expiry = Number(
            await publicClient.readContract({
              address: V1_BASE_REGISTRAR,
              abi: parseAbi([
                'function nameExpires(uint256) view returns(uint256)',
              ]),
              functionName: 'nameExpires',
              args: [BigInt(labelhash(root.split('.')[0]))],
            }),
          )
          const inventory: MockV1Name[] = []
          for (const n of names) {
            const registryOwner = await publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi: parseAbi(['function owner(bytes32) view returns(address)']),
              functionName: 'owner',
              args: [namehash(n)],
            })
            const wrapped =
              registryOwner.toLowerCase() === V1_NAME_WRAPPER.toLowerCase()
            const wd = wrapped
              ? await publicClient.readContract({
                  address: V1_NAME_WRAPPER,
                  abi: parseAbi([
                    'function getData(uint256) view returns(address,uint32,uint64)',
                  ]),
                  functionName: 'getData',
                  args: [BigInt(namehash(n))],
                })
              : undefined
            const holder = wd?.[0] ?? registryOwner
            const signerUser = (
              ['user', 'user2', 'user3', 'user4'] as const
            ).find(
              (u) =>
                accounts.getAddress(u).toLowerCase() === holder.toLowerCase(),
            )!
            const rec = {
              texts: [{ key: 'description', value: `${id} baseline` }],
              addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
            }
            if (!(config.duration && config.duration < 0))
              await setV1RecordsOn(
                n,
                privateKeyToAccount(accounts.getPrivateKey(signerUser)),
                wrapped,
                rec,
              )
            inventory.push({
              name: n,
              ownerAddress: holder,
              registrantAddress:
                n === root && !wrapped ? owner.address : undefined,
              type: wrapped ? 'wrapped' : 'unwrapped',
              expiryDate: expiry,
              fullFuses: wd?.[1],
              wrapperExpiry: wd ? Number(wd[2]) : undefined,
              resolver: V1_PUBLIC_RESOLVER,
              records: rec,
            })
          }
          const before = await resolveRecords(name, {
            texts: [{ key: 'description', value: `${id} baseline` }],
            addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
          })
          a.before = before
          // Grace-period resolution can legitimately be unavailable; active fixtures must resolve before the migration is attempted.
          if (!(config.duration && config.duration < 0))
            expect(
              before.filter((record) => record.got !== record.want),
              'Active V1 fixture must resolve its seeded records',
            ).toEqual([])
          a.observations.inventory = inventory
          save()
          await mockV1Names(manager.page, inventory)
          await asAccount(manager, accounts, ownerUser)
          await manager.page.goto(`${MANAGER_APP_URL}/upgrade`)
          await expect(
            manager.page.getByRole('heading', {
              name: /ready to upgrade|renew your names before upgrading/i,
            }),
          ).toBeVisible({ timeout: 60000 })
          await selectOnlyRoots(manager.page, [root])
          const keep = manager.page.getByRole('checkbox', {
            name: /^Keep .* as a manager/,
          })
          if (await keep.count()) await keep.check()
          await shot(manager.page, 'migration-selection')
          try {
            await confirmAndAuthorize(manager.page, manager.wallet)
          } catch (error) {
            if (!gasRecovery) throw error
            a.observations.gasRecovery = await retryCurrentOutOfGas(
              BigInt(String(a.observations.startBlock)),
              owner.address,
            )
          }
          a.migration = 'Root flow completed'
          a.v2Status = await readV2NameStatus(name)
          save()
          // Independent emancipated children may require their own wallet's migration.
          const leaf = inventory.at(-1)!
          if (
            a.v2Status !== 2 &&
            leaf.fullFuses &&
            leaf.fullFuses & 65536 &&
            leaf.ownerAddress.toLowerCase() !== owner.address.toLowerCase()
          ) {
            await asAccount(manager, accounts, 'user')
            await manager.page.goto(`${MANAGER_APP_URL}/upgrade`)
            await expect(
              manager.page.getByRole('heading', { name: /ready to upgrade/i }),
            ).toBeVisible({ timeout: 60000 })
            const cb = manager.page.getByRole('checkbox', { name, exact: true })
            if (await cb.count()) await selectOnlyRoots(manager.page, [name])
            await shot(manager.page, 'child-selection')
            await confirmAndAuthorize(manager.page, manager.wallet)
            a.migration = 'Parent flow and independent child flow completed'
            a.v2Status = await readV2NameStatus(name)
            save()
          }
          expect
            .soft(a.v2Status, `Migration must recreate ${name} in V2`)
            .toBe(2)
          if (action === 'migration') {
            save()
            await info.attach('audit', {
              path: join(DIR, id + '.json'),
              contentType: 'application/json',
            })
            return
          }
          await manager.page.unroute(
            /(?:bigname\.sh|(?:localhost|127\.0\.0\.1):\d+)\/v1\//,
          )
          await mock.install(manager.page)
          for (const n of names) {
            const inv = inventory.find((x) => x.name === n)!
            const status = await readV2NameStatus(n).catch(() => null)
            mock.addName({
              name: n,
              owner: inv.ownerAddress,
              protocol: status === 2 ? 'v2' : 'v1',
              resolver:
                status === 2 ? await resolverFor(n) : V1_PUBLIC_RESOLVER,
              expiryDate:
                status === 2
                  ? Number(
                      await publicClient.readContract({
                        address: (await targetOf(n)).registryAddress,
                        abi: parseAbi([
                          'function getExpiry(uint256) view returns(uint64)',
                        ]),
                        functionName: 'getExpiry',
                        args: [BigInt(labelhash(n.split('.')[0]))],
                      }),
                    )
                  : expiry,
              records: [
                { key: 'description', value: `${id} baseline` },
                { key: 'addr', value: accounts.getAddress('user') },
              ],
            })
          }
          await asAccount(manager, accounts, 'user')
          await asAccount(explorer, accounts, 'user')
          a.after = await resolveRecords(name, {
            texts: [{ key: 'description', value: `${id} baseline` }],
            addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
          })
          save()
          await run('sync', async () => {
            await explorer.page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
            await expect(
              explorer.page.getByRole('heading', { name: /Ownership$/ }),
            ).toBeVisible()
            await shot(explorer.page, 'ownership')
            const visible = await explorer.page
              .getByRole('button', { name: /reclaim manager|sync manager/i })
              .count()
            return a.v2Status === 2
              ? {
                  status: visible === 0 ? 'N/A' : 'FAIL',
                  detail: `V2 has no V1 controller slot to sync. Reclaim/sync buttons observed: ${visible}. Role preservation is assessed separately.`,
                }
              : {
                  status: 'FAIL',
                  detail:
                    'Name was not migrated; no V2 sync equivalent can be assessed. See observed ownership page.',
                }
          })
          await run('dates', () =>
            checkMigratedDates({ name, root, manager, explorer, shot }),
          )
          await run('roles', async () => {
            await explorer.page.goto(`${PORTAL_APP_URL}/${name}/roles`)
            await explorer.page.waitForTimeout(2000)
            await shot(explorer.page, 'roles')
            const add = explorer.page.getByRole('button', {
              name: 'Add user',
              exact: true,
            })
            if (
              !(await add
                .waitFor({ state: 'visible', timeout: 15000 })
                .then(() => true)
                .catch(() => false))
            )
              return {
                status: 'FAIL',
                detail:
                  'No Add user action for this wallet; independent V2 registry role delegation unavailable in this observed route.',
              }
            await add.click()
            await explorer.page
              .getByLabel('User name or address')
              .fill(accounts.getAddress('user4'))
            await explorer.page
              .locator('#add-ROLE_SET_RESOLVER-manager')
              .click()
            await explorer.page
              .getByRole('button', { name: 'Save', exact: true })
              .click()
            await driveTransactionsToSuccess(
              explorer.page,
              explorer.wallet,
              ['tx-grant-roles'],
              60000,
            )
            const target = await targetOf(name)
            const roles = await readNameRoles(
              target,
              accounts.getAddress('user4'),
            )
            a.observations.grantedRoles = roles.decoded
            return {
              status: roles.decoded.includes('ROLE_SET_RESOLVER')
                ? 'PASS'
                : 'FAIL',
              detail:
                'Granted Set Resolver to a separate wallet in Explorer; chain role readback verified. This is not proof of the full legacy manager permission bundle.',
            }
          })
          await run('edit', async () => {
            await explorer.page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
            const type = explorer.page.getByLabel('Type', { exact: true })
            const denial = explorer.page.getByText(
              /You don't have permission to edit records/,
            )
            await expect(type.or(denial)).toBeVisible({ timeout: 30000 })
            await shot(explorer.page, 'edit-before')
            if (!(await type.isVisible()))
              return {
                status: 'FAIL',
                detail:
                  'ETH record edit form unavailable to the original connected wallet after the migration attempt.',
              }
            await type.selectOption('address')
            await explorer.page.locator('button[role="combobox"]').click()
            await explorer.page.getByPlaceholder('Search coins...').fill('ETH')
            await explorer.page
              .getByRole('button', { name: /^ETH\b/i })
              .first()
              .click()
            await explorer.page
              .getByLabel('Value', { exact: true })
              .fill(accounts.getAddress('user3'))
            await explorer.page
              .getByRole('button', { name: 'Add record', exact: true })
              .click()
            await explorer.page
              .getByRole('button', { name: /^Save \d+ changes?$/ })
              .click()
            await driveTransactionsToSuccess(
              explorer.page,
              explorer.wallet,
              ['tx-save-resolver-records'],
              60000,
            )
            const read = await resolveRecords(name, {
              addresses: [
                { coinType: 60, value: accounts.getAddress('user3') },
              ],
            })
            a.observations.ethWrite = read
            return {
              status: read.every((r) => r.got === r.want) ? 'PASS' : 'FAIL',
              detail:
                'Explorer ETH update submitted; checked actual name resolution. Independent role editing is reported separately.',
            }
          })
          await run('send', async () => {
            await explorer.page.goto(
              `${PORTAL_APP_URL}/${name}/ownership/transfer`,
            )
            await explorer.page.waitForTimeout(2000)
            await shot(explorer.page, 'transfer-before')
            const recipient = explorer.page.getByPlaceholder(
              'ENS name or address',
            )
            const managerOnly = start === 93
            if (managerOnly) {
              await expect(
                explorer.page.getByText(
                  'Only the current owner can transfer it.',
                  { exact: true },
                ),
              ).toBeVisible()
              await expect(recipient).toHaveCount(0)
              const currentOwner = await getOwner(publicClient as never, {
                name,
              })
              expect(String(currentOwner).toLowerCase()).toBe(
                owner.address.toLowerCase(),
              )
              return {
                status: 'PASS',
                detail:
                  'Manager-only transfer explicitly denied; registration remains with the original owner.',
              }
            }
            await expect(recipient).toBeVisible()
            await recipient.fill(accounts.getAddress('user3'))
            const detach = explorer.page.getByRole('switch', {
              name: /Detach the resolver/,
            })
            if ((await detach.isVisible()) && (await detach.isChecked()))
              await detach.uncheck()
            const eth = explorer.page.getByRole('switch', {
              name: /Set the ETH address/,
            })
            if (
              (await eth.isVisible()) &&
              (await eth.isEnabled()) &&
              (await eth.isChecked())
            )
              await eth.uncheck()
            const transfer = explorer.page.getByRole('button', {
              name: 'Transfer name',
              exact: true,
            })
            await expect(transfer).toBeEnabled({ timeout: 45000 })
            await transfer.click()
            // Transfer variant (safe/unsafe) is chosen by app. Verify receipt by owner readback, not variant assumptions.
            await driveTransactionsToSuccess(
              explorer.page,
              explorer.wallet,
              [],
              60000,
            )
            const current = await getOwner(publicClient as never, { name })
            a.observations.ownerAfterSend = current
            return {
              status:
                String(current).toLowerCase() ===
                accounts.getAddress('user3').toLowerCase()
                  ? 'PASS'
                  : 'FAIL',
              detail:
                'Transfer submitted through Explorer and owner read from the chain.',
            }
          })
          a.observations.endBlock = String(
            await publicClient.getBlockNumber({ cacheTime: 0 }),
          )
          await shot(explorer.page, 'final')
          save()
        } catch (e) {
          a.error = short(e)
          await shot(manager.page, 'prerequisite-manager').catch(() => {})
          await shot(explorer.page, 'prerequisite-explorer').catch(() => {})
          for (const k of [action])
            if (!a.checks[k])
              a.checks[k] = {
                status: 'BLOCKED',
                detail:
                  'Fixture or migration prerequisite failed; not a product pass/fail.',
                error: short(e),
              }
          save()
          await info.attach('audit', {
            path: join(DIR, id + '.json'),
            contentType: 'application/json',
          })
          throw e
        }
        await info.attach('audit', {
          path: join(DIR, id + '.json'),
          contentType: 'application/json',
        })
      })
    }
  }
}
