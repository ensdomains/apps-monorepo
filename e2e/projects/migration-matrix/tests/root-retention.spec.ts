import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { labelhash, namehash, parseAbi, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  type V1NameType,
} from '../../../fixtures/makeV1Name.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { readV2Status } from '../../../helpers/migration-assertions.js'
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
import { readNameRoles } from '../../../helpers/role-assertions.js'
import { expect, overrideManagerFeatureFlags, test } from '../matrix-fixture.js'

const cases: { type: V1NameType; split: boolean; keep: boolean }[] = [
  { type: 'unwrapped', split: false, keep: false },
  { type: 'unwrapped', split: true, keep: true },
  { type: 'unwrapped', split: true, keep: false },
  { type: 'wrapped', split: false, keep: false },
  { type: 'locked', split: false, keep: false },
]

for (const scenario of cases) {
  const id = `${scenario.type}-${scenario.split ? 'split' : 'same'}-${scenario.keep ? 'keep' : 'default'}`
  test(`root retention ${id}`, async ({
    page,
    wallet,
    accounts,
    connectedPage,
  }, testInfo) => {
    const evidence: Record<string, unknown> = {
      scenario,
      layer: 'Browser + live fork contracts; mocked name discovery',
      phase: 'fixture',
      started: new Date().toISOString(),
    }
    const directory = resolve(
      process.env.REPLACEMENT_RESULTS ?? 'test-results/migration-matrix',
      'observations',
    )
    mkdirSync(directory, { recursive: true })
    try {
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'profile-view-new': true,
        'migration-subname-recreation': true,
      })
      const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
      const manager = privateKeyToAccount(
        accounts.getPrivateKey(scenario.split ? 'user2' : 'user'),
      )
      const name = await createMakeV1Name({ userAccount: owner })({
        label: `matrix-${id}`,
        type: scenario.type,
      })
      evidence.name = name
      if (scenario.split) {
        const hash = await walletClient.writeContract({
          account: owner,
          address: V1_ENS_REGISTRY,
          abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
          functionName: 'setOwner',
          args: [namehash(name), manager.address],
        })
        expect(
          (await publicClient.waitForTransactionReceipt({ hash })).status,
        ).toBe('success')
      }
      const records: V1Records = {
        texts: [
          { key: 'url', value: `https://example.com/${id}` },
          { key: 'description', value: `Retention ${id} — unicode ✓` },
        ],
        addresses: [
          { coinType: 60, value: owner.address },
          { coinType: 2147483658, value: manager.address },
        ],
        contenthash:
          '0xe30101701220b4b78f5e39d72872c0b0fe1d684c185c0ee3c4d783abdd452c8a9271def0e668',
        abis: [
          {
            contentType: 1,
            data: stringToHex(
              '[{"type":"function","name":"read","inputs":[],"outputs":[],"stateMutability":"view"}]',
            ),
          },
        ],
        interfaces: [{ interfaceId: '0x12345678', implementer: owner.address }],
      }
      await setV1RecordsOn(
        name,
        manager,
        scenario.type !== 'unwrapped',
        records,
      )
      const before = await resolveRecords(name, records)
      evidence.before = before
      expect(
        before.filter((r) => r.want !== r.got),
        'fixture must resolve every seeded record before migration',
      ).toEqual([])
      const expiry = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi([
          'function nameExpires(uint256 id) view returns(uint256)',
        ]),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(name.split('.')[0]))],
      })
      const wrapperData =
        scenario.type === 'unwrapped'
          ? undefined
          : await publicClient.readContract({
              address: V1_NAME_WRAPPER,
              abi: parseAbi([
                'function getData(uint256 id) view returns(address,uint32,uint64)',
              ]),
              functionName: 'getData',
              args: [BigInt(namehash(name))],
            })
      await mockV1Names(page, [
        {
          name,
          expiryDate: Number(expiry),
          fullFuses: wrapperData?.[1],
          wrapperExpiry: wrapperData ? Number(wrapperData[2]) : undefined,
          type: scenario.type,
          ownerAddress: manager.address,
          registrantAddress: owner.address,
          records: {
            texts: [...records.texts!],
            addresses: [...records.addresses!],
            contentHash: records.contenthash,
            abiContentTypes: [1],
          },
        },
      ])
      evidence.phase = 'migration UI'
      await openMigrationFlow(connectedPage)
      await expect(rootRow(page, name)).toBeChecked({ timeout: 90_000 })
      if (scenario.split) {
        const keep = page.getByRole('checkbox', {
          name: /Keep .* as a manager/,
        })
        await expect(keep).toBeVisible()
        await keep.setChecked(scenario.keep)
        evidence.keepManagerCopy = await keep.locator('xpath=..').innerText()
      }
      evidence.beforeUI = await page.locator('body').innerText()
      await expect
        .poll(
          async () =>
            (await page
              .getByRole('button', { name: /^Upgrade \d+ names?$/ })
              .isEnabled()) ||
            (await page
              .getByText("Couldn't prepare your upgrade. Please try again.")
              .isVisible()),
          { timeout: 90_000 },
        )
        .toBe(true)
      if (
        await page
          .getByText("Couldn't prepare your upgrade. Please try again.")
          .isVisible()
      )
        throw new Error('Migration preparation failed before wallet submission')
      const outcome = await upgradeAndSettle(page, wallet)
      evidence.outcome = outcome
      evidence.afterUI = await page.locator('body').innerText()
      evidence.phase = 'after migration assertions'
      const label = name.split('.')[0]
      const status = await readV2Status(label)
      evidence.v2Status = status
      const after = await resolveRecords(name, records)
      evidence.after = after
      evidence.resolver = await resolverFor(name).catch(
        (e) => String(e).split('\n')[0],
      )
      evidence.ownerRoles = await readNameRoles({ label }, owner.address)
      evidence.managerRoles = await readNameRoles({ label }, manager.address)
      expect.soft(outcome, 'UI migration outcome').toBe('success')
      expect.soft(status, 'name actually registered in V2').toBe(2)
      for (const r of after)
        expect.soft(r.got, `after migration ${r.what}`).toBe(r.want)
      evidence.phase = 'complete'
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      evidence.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      evidence.queryFailures = await page
        .evaluate(() => {
          const router = (
            window as unknown as {
              __TSR_ROUTER__?: {
                options: {
                  context: {
                    queryClient: {
                      getQueryCache(): {
                        getAll(): {
                          queryKey: unknown
                          state: { error: unknown }
                        }[]
                      }
                    }
                  }
                }
              }
            }
          ).__TSR_ROUTER__
          const describe = (error: unknown, depth = 0): unknown => {
            if (!error || depth > 5) return String(error)
            if (typeof error !== 'object') return error
            const e = error as Record<string, unknown>
            return {
              name: e.name,
              message: e.message,
              reason: e.reason,
              stage: e.stage,
              cause: e.cause ? describe(e.cause, depth + 1) : undefined,
            }
          }
          return router?.options.context.queryClient
            .getQueryCache()
            .getAll()
            .filter((q) => q.state.error)
            .map((q) => ({ key: q.queryKey, error: describe(q.state.error) }))
        })
        .catch(() => [])
      evidence.assertionErrors = testInfo.errors.map((e) => e.message)
      evidence.completed = new Date().toISOString()
      const file = resolve(directory, `${id}.json`)
      writeFileSync(
        file,
        JSON.stringify(
          evidence,
          (_key, value) => (typeof value === 'bigint' ? String(value) : value),
          2,
        ),
      )
      await testInfo.attach('retention evidence', {
        path: file,
        contentType: 'application/json',
      })
    }
  })
}
