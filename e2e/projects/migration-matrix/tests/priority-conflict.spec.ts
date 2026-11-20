import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { computeStandaloneHcaAddress } from '../../../../packages/smart-account/src/providers/rhinestone/initialize-account.js'
import {
  getDestinationContracts,
  USER_SALT,
} from '../../../../packages/smart-account/src/providers/rhinestone/manifest.js'
import { buildHcaOwnerExecutionCall } from '../../../../packages/smart-account/src/providers/rhinestone/owner-execution.js'
import { computeVerifiableProxyAddress } from '../../../../packages/smart-account/src/verifiable-factory.js'
import { V1_PUBLIC_RESOLVER } from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { dismissBackendAuthModal } from '../../../helpers/manager-auth.js'
import { openMigrationFlow, rootRow } from '../../../helpers/migration-flow.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
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
const abi = parseAbi([
  'function deploy(address owner,address implementation,uint256 salt) returns(address)',
  'function deployProxy(address implementation,uint256 salt,bytes initData) returns(address)',
  'function initialize((address account,uint256 roleBitmap)[] roles)',
  'function setParent(address parent,string label)',
  'function register(string label,address owner,address subregistry,address resolver,uint256 roleBitmap,uint64 expiry) returns(uint256)',
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 id) view returns(State)',
  'function getResolver(string label) view returns(address)',
])

test('priority destination conflict CFG-0015 refuses without overwriting existing child', async ({
  page,
  wallet,
}, info) => {
  info.setTimeout(600000)
  const c = configs.find((value) => value.config_id === 'CFG-0015')
  if (!c) throw new Error('Missing direct-child configuration')
  const f = await seedConfiguration(c)
  const output = resolve(
    process.env.REPLACEMENT_RESULTS ??
      (() => {
        throw new Error('Results directory required')
      })(),
    'supplemental',
  )
  mkdirSync(output, { recursive: true })
  const evidence: Record<string, unknown> = {
    id: 'destination-conflict',
    configurations: [c.config_id],
    startedAt: new Date().toISOString(),
    phase: 'fixture',
    scope:
      'Real canonical factory/HCA deployment creates an existing destination child owned by W3. V1 child belongs to W2. No bytecode or storage overrides.',
  }
  const save = () =>
    writeFileSync(
      resolve(output, 'destination-conflict.json'),
      JSON.stringify(
        evidence,
        (_key, value) => (typeof value === 'bigint' ? String(value) : value),
        2,
      ),
    )
  try {
    const owner = account('W1').address
    const hca = computeStandaloneHcaAddress({ chainId: 11155111, owner })
    const contracts = getDestinationContracts(11155111)
    const allRoles = BigInt(`0x${'1'.repeat(64)}`)
    if (!(await publicClient.getCode({ address: hca })))
      await send(
        account('W1'),
        contracts.standaloneHcaFactory,
        encodeFunctionData({
          abi,
          functionName: 'deploy',
          args: [owner, contracts.standaloneHcaImplementation, USER_SALT],
        }),
      )
    const salt = BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'bytes32' }],
          [
            keccak256(stringToHex('ENSManagerMigrationUserRegistry:v1')),
            namehash(f.root),
          ],
        ),
      ),
    )
    const registry = computeVerifiableProxyAddress({
      factory: contracts.verifiableFactory,
      proxyLogic: contracts.verifiableFactoryProxyLogic,
      deployer: hca,
      salt,
    })
    const ens = ensL1Contracts[supportedL1Chains.sepolia]
    const setup = buildHcaOwnerExecutionCall({
      hca,
      calls: [
        {
          to: contracts.verifiableFactory,
          value: 0n,
          data: encodeFunctionData({
            abi,
            functionName: 'deployProxy',
            args: [
              ens.ensUserRegistryImpl.address,
              salt,
              encodeFunctionData({
                abi,
                functionName: 'initialize',
                args: [
                  [
                    { account: hca, roleBitmap: allRoles },
                    { account: owner, roleBitmap: allRoles },
                  ],
                ],
              }),
            ],
          }),
        },
        {
          to: registry,
          value: 0n,
          data: encodeFunctionData({
            abi,
            functionName: 'setParent',
            args: [ens.ensRegistry.address, f.label],
          }),
        },
        {
          to: registry,
          value: 0n,
          data: encodeFunctionData({
            abi,
            functionName: 'register',
            args: [
              'child',
              account('W3').address,
              zeroAddress,
              V1_PUBLIC_RESOLVER,
              allRoles,
              (1n << 64n) - 1n,
            ],
          }),
        },
      ],
    })
    evidence.setupHash = (
      await send(account('W1'), setup.to, setup.data)
    ).transactionHash
    const readDestination = () =>
      publicClient.readContract({
        address: registry,
        abi,
        functionName: 'getState',
        args: [BigInt(labelhash('child'))],
      })
    const before = await readDestination()
    expect(before.latestOwner.toLowerCase()).toBe(
      account('W3').address.toLowerCase(),
    )
    evidence.destination = { registry, before }
    evidence.subject = f.leaf
    evidence.names = f.names
    evidence.beforeActivity = await chainActivity(f.startBlock)
    evidence.beforeRecords = await Promise.all(
      f.names.map(async (name) => ({
        name,
        records: await resolveRecords(name, f.recordsFor(name)),
      })),
    )
    await page.clock.install({
      time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000),
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
    evidence.phase = 'conflict gate'
    save()
    const specificConflict = page
      .getByText(
        /already.*registered|already exists|conflict|different.*owner|existing.*registration|cannot.*import|destination|reserved, registered/i,
      )
      .first()
    const genericFailure = page.getByText(
      "Couldn't prepare your upgrade. Please try again.",
      { exact: true },
    )
    await expect(specificConflict.or(genericFailure).first()).toBeVisible({
      timeout: 120000,
    })
    const specificExplanation = await specificConflict.isVisible()
    const upgradeBlocked = !(await page
      .getByRole('button', { name: /^Upgrade \d+ names?$/ })
      .isEnabled()
      .catch(() => false))
    const pendingWalletRequests = wallet.getPendingRequestCount(
      Web3RequestKind.SendTransaction,
    )
    const afterDestination = await readDestination()
    const afterRoot = await v2State(f.root)
    evidence.afterDestination = afterDestination
    evidence.afterRoot = afterRoot
    evidence.checks = {
      'Conflict explanation identifies the actual problem': {
        result: specificExplanation ? 'PASS' : 'FAIL',
        specificExplanation,
      },
      'Migration submission blocked': {
        result: upgradeBlocked && pendingWalletRequests === 0 ? 'PASS' : 'FAIL',
        upgradeBlocked,
        pendingWalletRequests,
      },
      'Existing destination child unchanged': {
        result:
          JSON.stringify(afterDestination, (_key, value) =>
            typeof value === 'bigint' ? String(value) : value,
          ) ===
          JSON.stringify(before, (_key, value) =>
            typeof value === 'bigint' ? String(value) : value,
          )
            ? 'PASS'
            : 'FAIL',
      },
      'Source parent remains unmigrated': {
        result: afterRoot?.status !== 2 ? 'PASS' : 'FAIL',
      },
    }
    expect
      .soft(
        specificExplanation,
        'Explain the destination conflict instead of only a generic retry error',
      )
      .toBe(true)
    expect.soft(upgradeBlocked).toBe(true)
    expect.soft(pendingWalletRequests).toBe(0)
    expect.soft(afterDestination).toEqual(before)
    expect.soft(afterRoot?.status).not.toBe(2)
    const records = await Promise.all(
      f.names.map(async (name) => ({
        name,
        records: await resolveRecords(name, f.recordsFor(name)),
      })),
    )
    for (const value of records)
      expect(
        value.records.filter((record) => record.got !== record.want),
      ).toEqual([])
    evidence.finalRecords = records
    ;(evidence.checks as Record<string, unknown>)[
      'All source records remain exact'
    ] = { result: 'PASS' }
    evidence.result = info.errors.length ? 'FAIL' : 'PASS'
    evidence.phase = 'completed'
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    evidence.finalUI = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    evidence.afterActivity = await chainActivity(f.startBlock)
    evidence.assertionErrors = info.errors.map((error) => error.message)
    evidence.completedAt = new Date().toISOString()
    save()
    await page
      .screenshot({
        path: resolve(output, 'destination-conflict.png'),
        fullPage: true,
      })
      .catch(() => {})
  }
})
