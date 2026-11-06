/**
 * Which resolver a migrated name lands on, and whether its owner can still
 * edit its records in both apps afterwards.
 *
 * PublicResolverV2 lets a name's records be written only if the NameWrapper
 * knows the name (`canModifyName` is false when `NAME_WRAPPER.names(node)` is
 * empty), so a never-wrapped name left on it can't be edited by anyone. The
 * migration should therefore give an unwrapped name the owner's own
 * PermissionedResolver (`to-owned-permres`), and use PublicResolverV2 only for
 * a locked name with CANNOT_SET_RESOLVER burnt — which is wrapped, so its
 * records stay writable.
 *
 * Check 1: an unwrapped .eth name → the owner's PermissionedResolver, records
 *          editable in the manager and the explorer.
 * Check 2: a locked name with CANNOT_SET_RESOLVER on the V1 public resolver →
 *          PublicResolverV2, records still editable in both apps.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, namehash, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  CERTIFIED_V1_RESOLVER,
  createMakeV1Name,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  type AppSession,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { expectedKeptResolver } from '../../../helpers/migration-assertions.js'
import {
  openMigrationFlow,
  runMigrationFlow,
} from '../../../helpers/migration-flow.js'
import {
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const ETH_REGISTRY = sepolia.ensRegistry.address as Address
const FACTORY = sepolia.ensVerifiableFactory.address as Address
const PERMISSIONED_RESOLVER_IMPL = sepolia.ensPermissionedResolverImpl
  .address as Address
/** PublicResolverV2 on Sepolia, as the ticket names it. */
const PUBLIC_RESOLVER_V2 = '0xdC4a563d00F5c3012b699794eB9e13A561Be386F'
const CANNOT_SET_RESOLVER = 8

const ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function verifyContract(address proxy) view returns (address)',
  'function setFuses(bytes32 node, uint16 ownerControlledFuses) returns (uint32)',
  'function setResolver(bytes32 node, address resolver)',
  'function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)',
])

const labelOf = (name: string) => name.replace(/\.eth$/, '')
const unique = (tag: string) => `${tag} ${Date.now().toString(36)}`

const v2ResolverOf = (name: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: ABI,
    functionName: 'getResolver',
    args: [labelOf(name)],
  })

/** The implementation behind a VerifiableFactory proxy (zero if not one). */
const implementationOf = (proxy: Address) =>
  publicClient
    .readContract({
      address: FACTORY,
      abi: ABI,
      functionName: 'verifyContract',
      args: [proxy],
    })
    .catch(() => zeroAddress as Address)

async function migrateInManager(
  manager: AppSession,
  owner: Address,
  name: string,
  type: 'unwrapped' | 'locked',
) {
  await serveV1Names(manager.page, {
    ownerAddress: owner,
    roots: [{ kind: 'registration', label: labelOf(name), type }],
  })
  await openMigrationFlow(manager.page)
  await runMigrationFlow(manager.page, manager.wallet, { roots: [name] })
}

/** Save a description through the manager's Edit Profile dialog. */
async function editInManager(manager: AppSession, name: string, text: string) {
  const { page } = manager
  await page.goto(`${MANAGER_APP_URL}/${name}`)
  await page.getByRole('button', { name: 'Edit Profile' }).click({
    timeout: 60_000,
  })
  await page.getByPlaceholder('Description').fill(text)
  await saveProfileChanges(page, manager.wallet)
  await waitForProfileUpdated(page)
}

/** Save a description through the explorer's record editor. */
async function editInExplorer(
  explorer: AppSession,
  name: string,
  text: string,
) {
  const { page, wallet } = explorer
  await page.goto(`${PORTAL_APP_URL}/${name}/edit-records`)
  await page.getByLabel('Type', { exact: true }).selectOption('text')
  await page.getByLabel('Key', { exact: true }).fill('description')
  await page.getByLabel('Value', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Add record' }).click()
  await page
    .getByRole('button', { name: 'Save 1 change' })
    .click({ timeout: 30_000 })
  await driveTransactionsToSuccess(page, wallet, ['tx-save-resolver-records'])
}

/** The record resolves to `text`, polling while the write lands. */
async function expectDescription(name: string, text: string) {
  await expect
    .poll(
      async () =>
        expectRecordsResolve(name, {
          texts: [{ key: 'description', value: text }],
        }).then(
          () => true,
          () => false,
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
}

test.describe('Migration resolver: never-wrapped names stay editable', () => {
  test.describe.configure({ timeout: 600_000 })

  test('check 1 — an unwrapped .eth name gets the owner’s own PermissionedResolver, editable in both apps', {
    tag: ['@scenario:GU4'],
  }, async ({ explorer, manager, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'qa-unwrapped-res',
    })

    await migrateInManager(manager, owner.address, name, 'unwrapped')

    const resolver = await v2ResolverOf(name)
    console.log(`[migration-resolver] ${name} → resolver ${resolver}`)
    expect(
      resolver.toLowerCase(),
      'an unwrapped name must not land on PublicResolverV2',
    ).not.toBe(PUBLIC_RESOLVER_V2.toLowerCase())
    expect(
      (await implementationOf(resolver)).toLowerCase(),
      'the resolver is a PermissionedResolver deployed through the factory',
    ).toBe(PERMISSIONED_RESOLVER_IMPL.toLowerCase())
    await waitForBignameBlock()

    const fromManager = unique('edited in the manager')
    await editInManager(manager, name, fromManager)
    await expectDescription(name, fromManager)

    const fromExplorer = unique('edited in the explorer')
    await editInExplorer(explorer, name, fromExplorer)
    await expectDescription(name, fromExplorer)
  })

  // The locked controller swaps only the V1 resolvers in its
  // PUBLIC_RESOLVER_SET for PublicResolverV2. On Sepolia that set holds the
  // older public resolver (0xE99638b4) but not the current one (0x8FADE66B,
  // ensjs's ensPublicResolver), so the two take different routes.
  for (const variant of [
    {
      tag: 'certified',
      v1Resolver: CERTIFIED_V1_RESOLVER,
    },
    { tag: 'current', v1Resolver: V1_PUBLIC_RESOLVER as Address },
  ]) {
    test(`check 2 — a locked CANNOT_SET_RESOLVER name on the ${variant.tag} V1 public resolver stays editable in both apps`, {
      tag: ['@scenario:GW6'],
    }, async ({ explorer, manager, accounts }) => {
      test.fail(
        variant.tag === 'current',
        'E2E-037: the controller does not certify this V1 public resolver, so the manager refuses the upgrade',
      )
      const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
      const name = await createMakeV1Name({ userAccount: owner })({
        label: `qa-locked-csr-${variant.tag}`,
        type: 'locked',
      })
      const node = namehash(name)
      const send = async (
        functionName: 'setResolver' | 'setFuses',
        arg: Address | number,
      ) => {
        const hash = await walletClient.writeContract({
          account: owner,
          chain: walletClient.chain,
          address: V1_NAME_WRAPPER,
          abi: ABI,
          functionName,
          args: [node, arg as never],
        } as never)
        await publicClient.waitForTransactionReceipt({ hash })
      }
      // Point it at the variant's public resolver, then freeze the choice.
      await send('setResolver', variant.v1Resolver)
      await send('setFuses', CANNOT_SET_RESOLVER)
      const [, fuses] = await publicClient.readContract({
        address: V1_NAME_WRAPPER,
        abi: ABI,
        functionName: 'getData',
        args: [BigInt(node)],
      })
      expect(fuses & CANNOT_SET_RESOLVER, 'precondition: CSR burnt').toBe(
        CANNOT_SET_RESOLVER,
      )
      const kept = await expectedKeptResolver(variant.v1Resolver)
      console.log(
        `[migration-resolver] ${variant.tag}: controller keeps ${kept} for V1 resolver ${variant.v1Resolver}`,
      )

      await migrateInManager(manager, owner.address, name, 'locked')

      const resolver = await v2ResolverOf(name)
      console.log(`[migration-resolver] ${name} → resolver ${resolver}`)
      expect(resolver.toLowerCase()).toBe(kept.toLowerCase())
      await waitForBignameBlock()

      // The ticket's oracle, whichever resolver it kept: the owner can still
      // edit the name's records in both apps.
      const fromManager = unique(`locked ${variant.tag}, edited in the manager`)
      await editInManager(manager, name, fromManager)
      await expectDescription(name, fromManager)

      const fromExplorer = unique(
        `locked ${variant.tag}, edited in the explorer`,
      )
      await editInExplorer(explorer, name, fromExplorer)
      await expectDescription(name, fromExplorer)
    })
  }
})
