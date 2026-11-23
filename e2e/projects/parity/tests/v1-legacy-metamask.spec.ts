import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { localMetaMask } from '../helpers/metamask.js'

for (const id of ['L305', 'L308', 'L313']) {
  test(`${id} connect the actual MetaMask extension to the replacement app`, async ({
    accounts,
  }, info) => {
    test.setTimeout(150_000)
    const session = await localMetaMask(
      id === 'L308'
        ? (process.env.MANAGER_APP_URL ?? 'http://localhost:3000')
        : (process.env.PORTAL_APP_URL ?? 'http://localhost:3001'),
    )
    try {
      const connected = await session.page.evaluate(async () =>
        (
          window as unknown as {
            ethereum: {
              request: (args: { method: string }) => Promise<string[]>
            }
          }
        ).ethereum.request({ method: 'eth_accounts' }),
      )
      expect(connected[0].toLowerCase()).toBe(
        accounts.getAddress('user').toLowerCase(),
      )
      await expect(
        session.page.getByRole('button', {
          name: /^Connect( wallet| login)?$/i,
        }),
      ).toHaveCount(0)
      await info.attach('metamask-connected', {
        body: JSON.stringify({
          connected,
          ui: await session.page.locator('body').innerText(),
        }),
        contentType: 'application/json',
      })
    } finally {
      await session.context.close()
    }
  })
}
