import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import dappwright from '@tenkeylabs/dappwright'
import { toHex } from 'viem'
import { publicClient } from '../../../helpers/anvil-client.js'

const VERSION = '12.23.0'
export async function localMetaMask(url: string) {
  // Dappwright only searches GitHub's newest release page. Fetch the pinned official asset when it has aged off that page.
  const cache = join(
    tmpdir(),
    'dappwright',
    'metamask',
    VERSION.replaceAll('.', '_'),
  )
  if (!existsSync(join(cache, 'manifest.json'))) {
    const response = await fetch(
      `https://github.com/MetaMask/metamask-extension/releases/download/v${VERSION}/metamask-chrome-${VERSION}.zip`,
    )
    if (!response.ok)
      throw new Error(`MetaMask fixture download failed: ${response.status}`)
    const zip = join(tmpdir(), `ens-parity-metamask-${VERSION}.zip`)
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()))
    mkdirSync(cache, { recursive: true })
    execFileSync('unzip', ['-q', '-o', zip, '-d', cache])
    const source = readFileSync(
        createRequire(import.meta.url).resolve('@tenkeylabs/dappwright'),
        'utf8',
      ),
      key = source.match(/\.key="(MIIB[^"]+)"/)?.[1]
    if (!key) throw new Error('Dappwright extension key could not be found')
    const manifest = JSON.parse(
      readFileSync(join(cache, 'manifest.json'), 'utf8'),
    )
    manifest.key = key
    writeFileSync(join(cache, 'manifest.json'), JSON.stringify(manifest))
  }
  const [wallet, extension, context] = await dappwright.bootstrap('', {
    wallet: 'metamask',
    version: VERSION,
    headless: false,
    seed: 'test test test test test test test test test test test junk',
    password: 'ParityLocalOnly-2026!',
    showTestNets: true,
  })
  try {
    await wallet.switchNetwork('Sepolia')
    await extension.goto(`${extension.url().split('#')[0]}#settings/networks`)
    await extension
      .getByTestId('network-list-item-options-button-eip155:11155111')
      .click()
    await extension.getByTestId('network-list-item-options-edit').click()
    await extension.getByTestId('test-add-rpc-drop-down').click()
    await extension
      .getByRole('button', { name: 'Add RPC URL', exact: true })
      .click()
    await extension
      .getByTestId('rpc-url-input-test')
      .fill(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545')
    await extension
      .getByRole('button', { name: 'Add URL', exact: true })
      .click()
    await extension.getByRole('button', { name: 'Save', exact: true }).click()
    const page = await context.newPage()
    await page.goto(url)
    await expect(async () => {
      if (
        !(await page
          .getByRole('dialog')
          .isVisible()
          .catch(() => false))
      )
        await page
          .getByRole('button', { name: /^Connect( wallet| login)?$/i })
          .first()
          .click({ timeout: 5000 })
      await expect(
        page.getByRole('dialog').getByText('MetaMask', { exact: true }),
      ).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 40000 })
    await Promise.all([
      wallet.approve(),
      page.getByRole('dialog').getByText('MetaMask', { exact: true }).click(),
    ])
    await expect(
      page.getByRole('button', { name: /^Connect( wallet| login)?$/i }),
    ).toHaveCount(0)
    const block = await publicClient.getBlock({ blockTag: 'latest' })
    const actual = (await page.evaluate(async (number) => {
      const provider = (
        window as unknown as {
          ethereum: {
            request: (p: {
              method: string
              params?: unknown[]
            }) => Promise<unknown>
          }
        }
      ).ethereum
      return provider.request({
        method: 'eth_getBlockByNumber',
        params: [number, false],
      })
    }, toHex(block.number))) as { hash: string } | null
    expect(
      actual?.hash,
      'MetaMask must be connected to this local fork before any transaction',
    ).toBe(block.hash)
    return { wallet, page, context }
  } catch (error) {
    await context.close()
    throw error
  }
}
export async function driveMetaMask(
  session: Awaited<ReturnType<typeof localMetaMask>>,
  ids: string[],
) {
  const { page, context } = session,
    dialog = page.getByRole('dialog'),
    done = new Set<string>()
  const listener = (message: { text: () => string }) => {
    for (const id of ids)
      if (
        message.text().includes(`Transaction ${id}`) &&
        message.text().includes('state: success')
      )
        done.add(id)
  }
  page.on('console', listener)
  try {
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const popup = context
        .pages()
        .find((candidate) => candidate.url().includes('notification.html'))
      if (popup && !popup.isClosed()) {
        const confirm = popup.getByTestId('confirm-footer-button')
        if (await confirm.isVisible().catch(() => false)) {
          await confirm.click()
          await page.waitForTimeout(500)
          continue
        }
        await page.waitForTimeout(500)
        continue
      }
      const open = dialog.getByRole('button', { name: /Open wallet/i }),
        start = dialog.getByRole('button', { name: /^(Start|Next|Done)$/ })
      if (await open.isVisible().catch(() => false)) {
        await open.click()
      } else if (
        await dialog
          .getByRole('button', { name: /^Waiting\.\.\.$/i })
          .isVisible()
          .catch(() => false)
      ) {
        const icon = dialog
          .getByRole('button', { name: /^Waiting\.\.\.$/i })
          .locator('xpath=preceding-sibling::button[1]')
        if (await icon.isVisible().catch(() => false)) await icon.click()
      } else if (
        (await start.isVisible().catch(() => false)) &&
        (await start.isEnabled())
      ) {
        await start.click()
      } else if (done.size === ids.length) break
      else if (
        await dialog
          .getByRole('button', { name: 'Try again', exact: true })
          .isVisible()
          .catch(() => false)
      )
        throw new Error(
          `MetaMask transaction failed: ${await dialog.innerText()}`,
        )
      await page.waitForTimeout(500)
    }
    expect([...done].sort()).toEqual([...ids].sort())
  } finally {
    page.off('console', listener)
  }
}
