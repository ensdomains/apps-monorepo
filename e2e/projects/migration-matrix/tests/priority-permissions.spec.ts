import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { localReceipt } from '../../../helpers/local-receipt.js'
import { dismissBackendAuthModal } from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { dnsEncode, resolveRecords } from '../../../helpers/resolve-records.js'
import {
  connectHeadless,
  expect,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { afterPermissions, v2State } from '../probes.js'
import { chainActivity } from '../record-evidence.js'
import {
  account,
  type Configuration,
  seedConfiguration,
  send,
} from '../seed.js'
import { checkActorUI } from '../ui-actions.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const abi = parseAbi([
  'function revokeRootRoles(uint256 roleBitmap,address user) returns(bool)',
  'function revokeRoles(uint256 resource,uint256 roleBitmap,address user) returns(bool)',
  'function grantRoles(uint256 resource,uint256 roleBitmap,address user) returns(bool)',
  'function roles(uint256 resource,address user) view returns(uint256)',
  'function setText(bytes name,string key,string value)',
  'function getResolver(string label) view returns(address)',
  'function setResolver(uint256 tokenId,address resolver)',
  'function unregister(uint256 tokenId)',
  'function register(string label,address owner,address subregistry,address resolver,uint256 roleBitmap,uint64 expiry) returns(uint256)',
])
const allRoles = BigInt(`0x${'1'.repeat(64)}`)
const setResolverRole = 1n << 24n
const scenarios = [
  { id: 'retained-manager-revoke', config: 'CFG-0003' },
  { id: 'parent-reclaim-unwrapped', config: 'CFG-0015' },
  { id: 'parent-reclaim-unlocked', config: 'CFG-0711' },
]

for (const scenario of scenarios) {
  test(`priority permissions ${scenario.id} ${scenario.config}`, async ({
    page,
    wallet,
    browser,
  }, info) => {
    info.setTimeout(600000)
    const c = configs.find((value) => value.config_id === scenario.config)
    if (!c || c.level === '4LD')
      throw new Error('Expected an included 2LD/3LD configuration')
    const output = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(output, { recursive: true })
    // Evidence is heterogeneous by design; no product object uses this ledger type.
    const evidence: Record<string, unknown> = {
      id: scenario.id,
      configurations: [c.config_id],
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      checks: {},
      scope:
        'Actual Manager migration, signed contract control changes, mined denied transactions, and explicitly named app checks. DNS, 4LD and legacy dependent stateful suites excluded.',
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
    const exactRecords = async (name: string) => {
      const records = await resolveRecords(name, f.recordsFor(name))
      expect(
        records.filter((record) => record.got !== record.want),
        `Exact records for ${name}`,
      ).toEqual([])
      return records
    }
    const deniedTransaction = async (
      actor: string,
      to: `0x${string}`,
      data: `0x${string}`,
    ) => {
      const hash = await walletClient.sendTransaction({
        account: account(actor),
        to,
        data,
        gas: 500000n,
      })
      const receipt = await localReceipt(hash)
      expect(
        receipt.status,
        `${actor} must be denied by the mined transaction`,
      ).toBe('reverted')
      return { hash, status: receipt.status }
    }
    try {
      evidence.subject = f.leaf
      evidence.names = f.names
      evidence.beforeActivity = await chainActivity(f.startBlock)
      evidence.beforeRecords = await Promise.all(f.names.map(exactRecords))
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
      evidence.phase = 'migration'
      save()
      expect(await upgradeAndSettle(page, wallet)).toBe('success')
      evidence.afterMigrationRecords = await Promise.all(
        f.names.map(exactRecords),
      )
      const state = await v2State(f.leaf)
      expect(state?.status).toBe(2)
      if (!state) throw new Error('Missing migrated registration')
      const resolver = await publicClient.readContract({
        address: state.registry,
        abi,
        functionName: 'getResolver',
        args: [state.label],
      })
      evidence.phase = 'control changes'
      save()
      if (scenario.id === 'retained-manager-revoke') {
        const before = await afterPermissions(f, 'W2')
        expect(before?.resolverRoles).toBe(0x1111111n)
        expect(before?.registryRoles).toBe(setResolverRole)
        checks['Original retained manager grants'] = {
          result: 'PASS',
          actual: before,
        }
        const revokeRecords = await send(
          account('W1'),
          resolver,
          encodeFunctionData({
            abi,
            functionName: 'revokeRootRoles',
            args: [0x1111111n, account('W2').address],
          }),
        )
        const afterRecords = await afterPermissions(f, 'W2')
        expect(afterRecords?.resolverRoles).toBe(0n)
        expect(afterRecords?.registryRoles).toBe(setResolverRole)
        expect(afterRecords?.records.result).toBe('DENIED')
        expect(afterRecords?.setResolver.result).toBe('ALLOWED')
        checks[
          'Revoke record access without silently revoking registry access'
        ] = {
          result: 'PASS',
          hash: revokeRecords.transactionHash,
          actual: afterRecords,
        }
        checks['Revoked manager record transaction reverts'] = {
          result: 'PASS',
          ...(await deniedTransaction(
            'W2',
            resolver,
            encodeFunctionData({
              abi,
              functionName: 'setText',
              args: [dnsEncode(f.leaf), 'description', 'must not be stored'],
            }),
          )),
        }
        const revokeRegistry = await send(
          account('W1'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'revokeRoles',
            args: [state.resource, setResolverRole, account('W2').address],
          }),
        )
        const after = await afterPermissions(f, 'W2')
        expect(after?.registryRoles).toBe(0n)
        expect(after?.resolverRoles).toBe(0n)
        checks['Revoked manager resolver-change transaction reverts'] = {
          result: 'PASS',
          ...(await deniedTransaction(
            'W2',
            state.registry,
            encodeFunctionData({
              abi,
              functionName: 'setResolver',
              args: [state.tokenId, zeroAddress],
            }),
          )),
          revocationHash: revokeRegistry.transactionHash,
        }
        evidence.revokedManagerUI = await checkActorUI(
          browser,
          f,
          'W2',
          'after',
          false,
          true,
          'revoked-manager',
        )
        const appChecks = evidence.revokedManagerUI as Awaited<
          ReturnType<typeof checkActorUI>
        >
        for (const app of appChecks)
          expect
            .soft(
              app.checks.editRecords.result,
              `${app.app}: revoked manager editor denial`,
            )
            .toBe('PASS')
        checks['Fresh Manager and Explorer editor access after revocation'] = {
          result: appChecks.every(
            (app) => app.checks.editRecords.result === 'PASS',
          )
            ? 'PASS'
            : 'FAIL',
        }
        const owner = await afterPermissions(f, 'W1')
        expect(owner?.records.result).toBe('ALLOWED')
        expect(owner?.setResolver.result).toBe('ALLOWED')
        const baseline = f.records.texts?.find(
          (record) => record.key === 'description',
        )?.value
        if (baseline === undefined)
          throw new Error('Missing seeded description')
        const ownerWrite = await send(
          account('W1'),
          resolver,
          encodeFunctionData({
            abi,
            functionName: 'setText',
            args: [dnsEncode(f.leaf), 'description', baseline],
          }),
        )
        checks['Owner remains able to write after revocation'] = {
          result: 'PASS',
          hash: ownerWrite.transactionHash,
        }
      } else {
        expect(state.latestOwner.toLowerCase()).toBe(
          account('W2').address.toLowerCase(),
        )
        const role = (resource: bigint, actor: string) =>
          publicClient.readContract({
            address: state.registry,
            abi,
            functionName: 'roles',
            args: [resource, account(actor).address],
          })
        await send(
          account('W2'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'grantRoles',
            args: [
              state.resource,
              setResolverRole,
              account('Operator').address,
            ],
          }),
        )
        expect(await role(state.resource, 'Operator')).toBe(setResolverRole)
        await send(
          account('W2'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'revokeRoles',
            args: [
              state.resource,
              setResolverRole,
              account('Operator').address,
            ],
          }),
        )
        expect(await role(state.resource, 'Operator')).toBe(0n)
        checks['Explicit child delegation and revocation'] = { result: 'PASS' }
        checks['Unrelated wallet cannot unregister child'] = {
          result: 'PASS',
          ...(await deniedTransaction(
            'Unrelated',
            state.registry,
            encodeFunctionData({
              abi,
              functionName: 'unregister',
              args: [state.tokenId],
            }),
          )),
        }
        const removed = await send(
          account('W1'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'unregister',
            args: [state.tokenId],
          }),
        )
        expect((await v2State(f.leaf))?.status).not.toBe(2)
        checks['Parent can unregister a child held by another wallet'] = {
          result: 'PASS',
          hash: removed.transactionHash,
        }
        const recreated = await send(
          account('W1'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'register',
            args: [
              state.label,
              account('W3').address,
              zeroAddress,
              resolver,
              allRoles,
              (1n << 64n) - 1n,
            ],
          }),
        )
        const current = await v2State(f.leaf)
        expect(current?.status).toBe(2)
        expect(current?.latestOwner.toLowerCase()).toBe(
          account('W3').address.toLowerCase(),
        )
        if (!current) throw new Error('Missing recreated registration')
        expect(await role(current.resource, 'W2')).toBe(0n)
        expect(await role(current.resource, 'Operator')).toBe(0n)
        expect(await role(current.resource, 'W3')).toBe(allRoles)
        checks[
          'Re-register to a third wallet without resurrecting old grants'
        ] = { result: 'PASS', hash: recreated.transactionHash, state: current }
        for (const actor of ['W2', 'Operator', 'Unrelated'])
          checks[`${actor} cannot change recreated child resolver`] = {
            result: 'PASS',
            ...(await deniedTransaction(
              actor,
              state.registry,
              encodeFunctionData({
                abi,
                functionName: 'setResolver',
                args: [current.tokenId, zeroAddress],
              }),
            )),
          }
        const newHolder = await send(
          account('W3'),
          state.registry,
          encodeFunctionData({
            abi,
            functionName: 'setResolver',
            args: [current.tokenId, resolver],
          }),
        )
        checks['New holder can control the child resolver'] = {
          result: 'PASS',
          hash: newHolder.transactionHash,
        }
      }
      evidence.finalRecords = await Promise.all(f.names.map(exactRecords))
      checks['All parent and subject records still resolve exactly'] = {
        result: 'PASS',
      }
      evidence.phase = 'completed'
    } catch (error) {
      evidence.error = String(error)
      throw error
    } finally {
      evidence.finalState = await v2State(f.leaf).catch((error) =>
        String(error),
      )
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      evidence.assertionErrors = info.errors.map((error) => error.message)
      evidence.completedAt = new Date().toISOString()
      save()
    }
  })
}
