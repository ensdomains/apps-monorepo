import {
  encodeFunctionData,
  type Hex,
  labelhash,
  namehash,
  parseAbi,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { V1_ENS_REGISTRY } from '../../../fixtures/makeV1Name.js'
import {
  asAccount,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import legacy from '../artifacts/LegacyResolverV5.json' with { type: 'json' }

test('L214 old registry names show registry upgrade guidance', async ({
  explorer,
  manager,
  accounts,
}, info) => {
  const abi = parseAbi([
    'function old() view returns(address)',
    'function owner(bytes32) view returns(address)',
    'function recordExists(bytes32) view returns(bool)',
    'function setSubnodeOwner(bytes32,bytes32,address)',
    'function setResolver(bytes32,address)',
  ])
  const old = await publicClient.readContract({
    address: V1_ENS_REGISTRY,
    abi,
    functionName: 'old',
  })
  const rootOwner = await publicClient.readContract({
      address: old,
      abi,
      functionName: 'owner',
      args: [zeroHash],
    }),
    account = privateKeyToAccount(accounts.getPrivateKey('user2')),
    tld = `legacy-parity-${Date.now()}`,
    name = `legacy.${tld}`
  await testClient.impersonateAccount({ address: rootOwner })
  await testClient.setBalance({ address: rootOwner, value: 10n ** 19n })
  try {
    expect(
      (
        await publicClient.waitForTransactionReceipt({
          hash: await walletClient.sendTransaction({
            account: rootOwner,
            to: old,
            data: encodeFunctionData({
              abi,
              functionName: 'setSubnodeOwner',
              args: [zeroHash, labelhash(tld), account.address],
            }),
          }),
        })
      ).status,
    ).toBe('success')
  } finally {
    await testClient.stopImpersonatingAccount({ address: rootOwner })
  }
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      account,
      address: old,
      abi,
      functionName: 'setSubnodeOwner',
      args: [namehash(tld), labelhash('legacy'), account.address],
    }),
  })
  const deployed = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.deployContract({
      account,
      abi: legacy.abi,
      bytecode: legacy.bytecode as Hex,
      args: [old],
    }),
  })
  if (!deployed.contractAddress)
    throw new Error('Legacy resolver fixture deployment failed')
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      account,
      address: old,
      abi,
      functionName: 'setResolver',
      args: [namehash(name), deployed.contractAddress],
    }),
  })
  expect(
    await publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi,
      functionName: 'recordExists',
      args: [namehash(name)],
    }),
  ).toBe(false)
  expect(
    (
      await publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi,
        functionName: 'owner',
        args: [namehash(name)],
      })
    ).toLowerCase(),
  ).toBe(account.address.toLowerCase())
  await waitForBignameBlock()
  await asAccount(explorer, accounts, 'user2')
  await asAccount(manager, accounts, 'user2')
  let guidance = false
  for (const [surface, page, url] of [
    ['Explorer', explorer.page, `${PORTAL_APP_URL}/${name}/edit-records`],
    ['Manager', manager.page, `${MANAGER_APP_URL}/${name}`],
  ] as const) {
    await page.goto(url)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await info.attach(surface, {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    guidance ||=
      (await page
        .getByText(/Registry out of date|Update registry|Upgrade registry/i)
        .count()) > 0 ||
      (await page.locator('a[href*="legacy.ens.domains/name/"]').count()) > 0
  }
  expect(
    guidance,
    'Name exists only in the old registry (verified fallback ownership), but no registry-upgrade guidance or legacy-manager link is offered',
  ).toBe(true)
})
