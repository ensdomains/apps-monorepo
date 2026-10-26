import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelhash, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { waitForBignameBlock } from '../../../helpers/bigname-sync.js'
import { driveMetaMask, localMetaMask } from '../helpers/metamask.js'

const portalUrl = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const renewer =
  ensL1Contracts[supportedL1Chains.sepolia].ensEthRenewerV1.address
for (const id of ['L306', 'L307', 'L314', 'L315']) {
  test(`${id} legacy wallet workflow with actual MetaMask`, async ({
    accounts,
  }, info) => {
    test.setTimeout(240_000)
    const owner = id === 'L307' ? 'user2' : 'user',
      account = privateKeyToAccount(accounts.getPrivateKey(owner))
    const name = await createMakeV1Name({ userAccount: account })({
      label: id.toLowerCase(),
      type: 'unwrapped',
    })
    if (id === 'L315')
      await makeV1RegistrySubname({
        parentName: name.replace(/\.eth$/, ''),
        childLabel: 'test',
        ownerAddress: account.address,
        parentOwnerAccount: account,
      })
    await waitForBignameBlock()
    const session = await localMetaMask(portalUrl),
      { page } = session
    try {
      if (id === 'L314') {
        await page.goto(`${portalUrl}/${name}/create-subname`)
        await page.locator('#label').fill('test')
        await page
          .getByRole('button', { name: 'Create subname', exact: true })
          .click()
        await driveMetaMask(session, ['tx-create-ens-subname'])
        expect(
          (
            await publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi: parseAbi(['function owner(bytes32) view returns(address)']),
              functionName: 'owner',
              args: [namehash(`test.${name}`)],
            })
          ).toLowerCase(),
        ).toBe(account.address.toLowerCase())
      } else if (id === 'L315') {
        await page.goto(`${portalUrl}/${name}/subnames`)
        const row = page.getByRole('row').filter({ hasText: `test.${name}` })
        await expect(row).toBeVisible()
        await row.getByRole('button', { name: /Delete/i }).click()
        await page.getByRole('button', { name: 'Confirm', exact: true }).click()
        await driveMetaMask(session, [`tx-delete-ens-subname-test.${name}`])
        expect(
          await publicClient.readContract({
            address: V1_ENS_REGISTRY,
            abi: parseAbi(['function owner(bytes32) view returns(address)']),
            functionName: 'owner',
            args: [namehash(`test.${name}`)],
          }),
        ).toBe('0x0000000000000000000000000000000000000000')
      } else {
        const read = () =>
          publicClient.readContract({
            address: V1_BASE_REGISTRAR,
            abi: parseAbi([
              'function nameExpires(uint256) view returns(uint256)',
            ]),
            functionName: 'nameExpires',
            args: [BigInt(labelhash(name.split('.')[0]))],
          })
        const before = await read(),
          target = new Date(Number(before + 86400n) * 1000)
        await page.goto(`${portalUrl}/addr/${account.address}/names`)
        await page.getByPlaceholder('Search names...').fill(name.split('.')[0])
        await page
          .getByRole('row')
          .filter({ hasText: name })
          .getByRole('checkbox')
          .first()
          .check()
        await page.getByRole('button', { name: 'Extend', exact: true }).click()
        const dialog = page.getByRole('dialog'),
          disclaimer = dialog.getByRole('button', { name: 'I Understand' }),
          next = dialog.getByRole('button', { name: 'Next', exact: true })
        await expect(disclaimer.or(next).first()).toBeVisible()
        if (await disclaimer.isVisible())
          await disclaimer.click({ timeout: 3000 }).catch(() => {})
        await dialog
          .getByRole('button', { name: 'Pick by date', exact: true })
          .click()
        await page.locator('#registration-expiry-date').click()
        await page
          .getByRole('combobox', { name: /Choose the Year/i })
          .selectOption(String(target.getUTCFullYear()))
        await page
          .getByRole('combobox', { name: /Choose the Month/i })
          .selectOption(String(target.getUTCMonth()))
        const formatted = await page.evaluate(
          ({ y, m, d }) => new Date(y, m, d).toLocaleDateString(),
          {
            y: target.getUTCFullYear(),
            m: target.getUTCMonth(),
            d: target.getUTCDate(),
          },
        )
        await page.locator(`button[data-day="${formatted}"]`).click()
        await next.click()
        await dialog.getByRole('button', { name: /^USDC\b/ }).click()
        await dialog.getByRole('button', { name: /^(Confirm|Next)$/ }).click()
        await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(
          1,
        )
        await driveMetaMask(session, [
          `renewal-approve-${renewer}`,
          `renewal-renew-${name}`,
        ])
        expect((await read()) - before).toBe(86400n)
      }
      await info.attach('metamask-result', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    } catch (error) {
      await info.attach('metamask-failure', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
      await info.attach('metamask-ui', {
        body: await page.locator('body').innerText(),
        contentType: 'text/plain',
      })
      throw error
    } finally {
      await session.context.close()
    }
  })
}
