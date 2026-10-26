import { namehash, parseAbi } from 'viem'
import {
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import {
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
  test,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { seedLegacyTree } from '../helpers/legacy-tree.js'

for (const id of ['L048', 'L049', 'L228', 'L284', 'L285']) {
  test(`${id} action availability during an indexer outage`, async ({
    explorer,
    manager,
    accounts,
  }, info) => {
    test.setTimeout(120_000)
    const wrapped = id === 'L049' || id === 'L284',
      deleting = id === 'L048' || id === 'L049'
    const { name, root } = await seedLegacyTree(
      {
        label: id,
        type: wrapped ? 'wrapped' : 'legacy',
        subnames: deleting
          ? [{ label: 'test', type: wrapped ? 'wrapped' : 'legacy' }]
          : undefined,
      },
      id,
      accounts,
    )
    await waitForBignameBlock()
    const page = explorer.page,
      route = deleting ? 'subnames' : id === 'L228' ? 'records' : 'resolver'
    await page.goto(`${PORTAL_APP_URL}/${deleting ? root : name}/${route}`)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const action = deleting
      ? /^Delete /i
      : id === 'L228'
        ? /Edit records$/
        : /Change resolver$/
    let before = await page
      .getByRole('button', { name: action })
      .or(page.getByRole('link', { name: action }))
      .count()
    await info.attach('before-outage', {
      body: await page.locator('main').innerText(),
      contentType: 'text/plain',
    })
    if (deleting && !before) {
      await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
      await expect(manager.page.locator('main')).toBeVisible()
      await manager.page.waitForLoadState('networkidle')
      before += await manager.page
        .getByRole('button', { name: action })
        .or(manager.page.getByRole('link', { name: action }))
        .count()
      await info.attach('manager-delete-controls', {
        body: await manager.page.locator('main').innerText(),
        contentType: 'text/plain',
      })
      expect(
        before,
        'Delete action is absent before any outage; disabled-on-error behavior cannot be exercised',
      ).toBeGreaterThan(0)
    }
    expect(
      before,
      'Expected action must be present before fault injection',
    ).toBeGreaterThan(0)
    let intercepted = 0
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.port === '5660') {
        intercepted++
        await route.abort('failed')
      } else await route.fallback()
    })
    await page.reload()
    await expect
      .poll(() => intercepted, 'Indexer fault must actually reach the page')
      .toBeGreaterThan(0)
    await page.waitForLoadState('networkidle')
    await info.attach('during-outage', {
      body: JSON.stringify({
        intercepted,
        ui: await page.locator('body').innerText(),
      }),
      contentType: 'application/json',
    })
    await expect(
      page.locator('main'),
      'The application must remain rendered during an indexer outage',
    ).toBeVisible()
    const actions = page
      .getByRole('button', { name: action })
      .or(page.getByRole('link', { name: action }))
    let enabled = 0
    for (const item of await actions.all())
      if ((await item.isVisible()) && (await item.isEnabled())) enabled++
    expect(
      enabled,
      'Legacy action was disabled during indexer failure. If new app deliberately relies on direct-chain authority, this behavior needs an explicit parity decision.',
    ).toBe(0)
    const owner = await publicClient.readContract({
      address: wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
      abi: parseAbi([
        'function owner(bytes32) view returns(address)',
        'function ownerOf(uint256) view returns(address)',
      ]),
      functionName: wrapped ? 'ownerOf' : 'owner',
      args: [wrapped ? BigInt(namehash(name)) : namehash(name)],
    } as never)
    expect(String(owner).toLowerCase()).toBe(
      accounts.getAddress('user').toLowerCase(),
    )
  })
}
