import { readFileSync } from 'node:fs'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { test as base, localSepolia } from '../../fixtures/playwright.manager.fixture.js'
import { dismissMatrixBackendOverlay, PERMITTED_SIGN_KINDS } from '../../helpers/manager-auth.js'
import { accountKey, type Configuration } from './seed.js'
import { acquireMatrixResourceSlot } from './resource-slot.js'

const configurations: Configuration[] = JSON.parse(readFileSync(new URL('./configurations.json', import.meta.url), 'utf8'))
export { expect, connectHeadless, localSepolia, overrideManagerFeatureFlags } from '../../fixtures/playwright.manager.fixture.js'

/** Choose the correct initiating wallet before the browser's first load.
 * No mid-navigation accountsChanged relay or shared wallet session is needed.
 */
export const test = base.extend<{ _matrixResourceSlot: void }>({
  _matrixResourceSlot: [async ({}, use, info) => {
    const release = await acquireMatrixResourceSlot(info)
    try { await use() } finally { release() }
  }, { auto: true, timeout: 0 }],
  wallet: async ({ page }, use, info) => {
    const id = info.title.match(/CFG-\d{4}/)?.[0]
    const c = configurations.find(c => c.config_id === id)
    const native = c && c.level !== '2LD' && c.root_type === 'Locked' && ['Locked', 'Detached'].includes(c.lock)
    const actor = !c ? 'W1' : native ? (c.name_holder.startsWith('W') ? c.name_holder : c.name_manager) : c.root_owner
    await page.addLocatorHandler(page.getByRole('alertdialog', { name: 'Verify your wallet' }), () => dismissMatrixBackendOverlay(page))
    const wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(actor)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
    await use(wallet)
  },
})
