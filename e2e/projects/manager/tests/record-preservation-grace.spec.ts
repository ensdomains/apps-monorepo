import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Hex, keccak256, labelhash, namehash, parseAbi, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  CHILD_FUSES,
  makeV1Subname,
  wrapV1SubnameOfUnwrapped,
} from '../../../fixtures/makeV1Subname.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  makeGraceV1Name,
  syncBrowserToChain,
} from '../../../fixtures/record-audit-grace.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { fundTestUsdc } from '../../../helpers/fund-test-usdc.js'
import { readV2NameStatus } from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import {
  type MockV1Name,
  mockV1Names,
} from '../../../helpers/record-audit-inventory.js'
import { assertRecordPreservation } from '../../../helpers/record-preservation-assertions.js'
import {
  resolveRecords,
  resolverFor,
} from '../../../helpers/resolve-records.js'

const cases = [
  { id: 'RP08', type: 'unwrapped', child: 'registry' },
  { id: 'RP09', type: 'wrapped', child: 'wrapped' },
] as const
for (const scenario of cases)
  test(`${scenario.id}: grace ${scenario.type} root / ${scenario.child} descendants ${'splitRoot' in scenario ? 'split root manager' : 'splitChild' in scenario ? 'split child holder' : 'same wallet'}`, async ({
    migrationConnectedPage: page,
    wallet,
    accounts,
  }, info) => {
    test.setTimeout(360_000)
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const other = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const audit: any = {
      id: scenario.id,
      title: info.title,
      inventory: 'fixture keys; values and ownership verified on chain',
      names: [],
      migration: 'NOT RUN',
      error: null,
    }
    const DIR = info.outputPath('evidence')
    mkdirSync(DIR, { recursive: true })
    const save = () =>
      writeFileSync(
        join(DIR, scenario.id + '.json'),
        JSON.stringify(audit, null, 2),
      )
    try {
      const inventory: MockV1Name[] = []
      const seed = async (root: string) => {
        let parent = root
        const entries: any[] = [
          {
            name: root,
            signer: owner,
            wrapped: scenario.type !== 'unwrapped',
            depth: 0,
          },
        ]
        for (let depth = 1; depth <= 2; depth++) {
          // An emancipated but unlocked child cannot emancipate its own child; test its child as parent-controlled.
          const signer = 'splitChild' in scenario ? other : owner
          const parentSigner = depth === 1 ? owner : signer
          const fuses = 0
          const name =
            scenario.child === 'registry'
              ? await makeV1RegistrySubname({
                  parentName: parent.replace(/\.eth$/, ''),
                  childLabel: 'child',
                  ownerAddress: signer.address,
                  parentOwnerAccount: parentSigner,
                  seedLabel: false,
                })
              : await makeV1Subname({
                  parentName: parent.replace(/\.eth$/, ''),
                  childLabel: 'child',
                  ownerAddress: signer.address,
                  parentOwnerAccount: parentSigner,
                  fuses,
                })
          entries.push({
            name,
            signer,
            wrapped: scenario.child !== 'registry',
            depth,
          })
          parent = name
        }
        for (const e of entries) {
          const records: V1Records = {
            pubkey: {
              x: keccak256(toHex('audit-x')),
              y: keccak256(toHex('audit-y')),
            },
            interfaces: [
              { interfaceId: '0x12345678', implementer: other.address },
            ],
            texts: [
              { key: 'description', value: `${scenario.id} depth ${e.depth}` },
              { key: 'com.example.custom', value: 'custom UTF-8 café 🌍' },
              { key: 'url', value: 'https://example.org/' + scenario.id },
            ],
            addresses: [
              { coinType: 60, value: other.address },
              {
                coinType: 0,
                value: '0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac',
              },
            ],
            contenthash:
              '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f',
            abis: [
              { contentType: 1, data: toHex('{"test":"test"}') },
              { contentType: 8, data: toHex('https://example.org/abi.json') },
            ],
          }
          await setV1RecordsOn(e.name, e.signer, e.wrapped, records)
          const before = await resolveRecords(e.name, records)
          const row = {
            name: e.name,
            depth: e.depth,
            records,
            before,
            beforeResolver: await resolverFor(e.name),
            beforeBlock: String(
              await publicClient.getBlockNumber({ cacheTime: 0 }),
            ),
            after: null,
            result: 'NOT VERIFIED',
          }
          audit.names.push(row)
          save()
          expect(
            before.filter((r) => r.got !== r.want),
            'valid before-migration baseline',
          ).toEqual([])
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
          let wrapperData: any
          if (e.wrapped)
            wrapperData = await publicClient.readContract({
              address: V1_NAME_WRAPPER,
              abi: parseAbi([
                'function getData(uint256) view returns(address,uint32,uint64)',
              ]),
              functionName: 'getData',
              args: [BigInt(namehash(e.name))],
            })
          inventory.push({
            name: e.name,
            ownerAddress: e.signer.address,
            type: e.wrapped ? 'wrapped' : 'unwrapped',
            expiryDate: expiry,
            fullFuses: wrapperData?.[1],
            wrapperExpiry: wrapperData ? Number(wrapperData[2]) : undefined,
            resolver: V1_PUBLIC_RESOLVER,
            records: {
              texts: [...records.texts!],
              addresses: [...records.addresses!],
              contentHash: records.contenthash,
              abiContentTypes: records.abis!.map((a) => a.contentType),
            },
          })
        }
      }
      const grace = await makeGraceV1Name({
        label: 'record-' + scenario.id.toLowerCase(),
        owner,
        wrapped: scenario.type === 'wrapped',
        beforeExpiry: seed,
      })
      const root = grace.name
      await syncBrowserToChain(page)
      await fundTestUsdc(owner.address)
      await mockV1Names(page, inventory)
      await page.goto(
        `${process.env.MANAGER_APP_URL ?? 'http://localhost:3000'}/upgrade`,
      )
      await expect(
        page.getByRole('heading', {
          name: /renew your names before upgrading|ready to upgrade/i,
        }),
      ).toBeVisible({ timeout: 60_000 })
      await selectOnlyRoots(page, [root])
      if ('splitRoot' in scenario)
        await page
          .getByRole('checkbox', { name: /^Keep .* as a manager/ })
          .check()
      await page.screenshot({
        path: join(DIR, scenario.id + '-before.png'),
        fullPage: true,
      })
      audit.migration = 'STARTED'
      save()
      try {
        await confirmAndAuthorize(page, wallet)
        audit.migration = 'COMPLETED'
      } catch (e) {
        audit.migration = 'FAILED / BLOCKED'
        audit.error = String(e)
      }
      for (const row of audit.names) {
        row.v2Status = await readV2NameStatus(row.name).catch(
          (error: unknown) => {
            row.migrationStatusError = String(error)
            return null
          },
        )
        row.after = await resolveRecords(row.name, row.records)
        row.afterBlock = String(
          await publicClient.getBlockNumber({ cacheTime: 0 }),
        )
        row.afterResolver = await resolverFor(row.name).catch(
          (e) => 'ERROR: ' + String(e).split('\n')[0],
        )
        row.result =
          audit.migration !== 'COMPLETED'
            ? 'NOT VERIFIED'
            : row.v2Status === null
              ? 'NOT VERIFIED'
              : row.v2Status !== 2
                ? 'NOT MIGRATED'
                : row.after.every((r: any) => r.got === r.want)
                  ? 'PASS'
                  : 'FAIL'
      }
      await page.screenshot({
        path: join(DIR, scenario.id + '-after.png'),
        fullPage: true,
      })
      save()
      expect(audit.migration, audit.error ?? 'migration completed').toBe(
        'COMPLETED',
      )
      assertRecordPreservation(audit.names)
    } catch (e) {
      audit.error = String(e)
      save()
      throw e
    }
  })
