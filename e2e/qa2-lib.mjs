/**
 * PR #1017 QA v2 harness.
 *
 * Adds two oracles the v1 harness lacked:
 *
 *   O1  expected confirmation count computed from chain state read over RPC
 *       *before* the run, independent of anything the app renders.
 *   O2  the connected EOA's nonce delta across the run. Every wallet
 *       confirmation is one EOA-signed transaction, so delta must equal the
 *       predicted count. v1's "footer count === dialog rows" check was
 *       tautological — both render the same stepDescriptors array.
 */
import { chromium } from '@playwright/test'
import { createPublicClient, http } from 'viem'

export const BASE = 'http://localhost:3000'
export const RPC = 'http://127.0.0.1:8545'
export const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
export const V1_BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85'
export const V1_NAME_WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8'

const approvalAbi = [
  { name: 'isApprovedForAll', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] },
  { name: 'getApproved', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
]

export const client = createPublicClient({ transport: http(RPC) })

/**
 * O2 baseline. Must be sampled AFTER seeding: the dev panel registers V1 names
 * from this same EOA, so a pre-seed baseline counts seeding transactions as if
 * they were wallet confirmations.
 */
export const nonceOf = () => client.getTransactionCount({ address: WALLET })

export async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`${method}: ${json.error.message}`)
  return json.result
}

/** Pull the live contract set + HCA address out of the app's own module. */
export async function readAppContracts(page) {
  return page.evaluate(async (owner) => {
    const m = await import('/@fs/Users/sg/ens/apps-monorepo/packages/smart-account/src/index.ts')
    return {
      contracts: m.getDestinationContracts(11155111),
      hca: m.computeStandaloneHcaAddress({ chainId: 11155111, owner }),
    }
  }, WALLET)
}

/** O1 inputs: everything the count formula depends on. */
export async function readChainState({ contracts, hca }) {
  const [code, baseReg, wrapper, ethReg, nonce] = await Promise.all([
    client.getCode({ address: hca }),
    client.readContract({ address: V1_BASE_REGISTRAR, abi: approvalAbi, functionName: 'isApprovedForAll', args: [WALLET, contracts.migrationHelper] }),
    client.readContract({ address: V1_NAME_WRAPPER, abi: approvalAbi, functionName: 'isApprovedForAll', args: [WALLET, contracts.migrationHelper] }),
    client.readContract({ address: contracts.ethRegistry, abi: approvalAbi, functionName: 'isApprovedForAll', args: [WALLET, hca] }).catch(() => null),
    client.getTransactionCount({ address: WALLET }),
  ])
  return {
    hcaDeployed: Boolean(code && code !== '0x'),
    baseRegistrarApproved: baseReg,
    nameWrapperApproved: wrapper,
    ethRegistryApproved: ethReg,
    nonce,
  }
}

/**
 * O1: predict the confirmation count and the ordered step kinds.
 *   N = D + A_base + A_wrap + A_reg + B + C
 * See pr-1017-test-plan-v2.md for the derivation.
 */
export function predict({ state, unwrapped = 0, wrapped = 0, tokensAlreadyApproved = 0, requiresManagerRestoration = false, batches = 1 }) {
  const rows = []
  if (!state.hcaDeployed) rows.push('deploy-hca')

  const missingTokens = Math.max(0, unwrapped - tokensAlreadyApproved)
  if (unwrapped > 0 && !state.baseRegistrarApproved && (unwrapped === 0 || missingTokens > 0)) {
    rows.push(missingTokens === 1 ? 'approve-token' : `approve-registrations(${unwrapped})`)
  }
  if (wrapped > 0 && !state.nameWrapperApproved) rows.push('approve-wrapped')

  const needsReg = requiresManagerRestoration && !state.ethRegistryApproved
  if (needsReg) rows.push('approve-manager-restoration')

  for (let i = 0; i < batches; i++) rows.push(batches > 1 ? `upgrade-batch-${i + 1}/${batches}` : 'upgrade')
  if (needsReg) rows.push('cleanup-revoke')

  return { n: rows.length, rows }
}

/** Map a rendered dialog row to the same vocabulary predict() emits. */
export function classifyRow(text) {
  // Rows render as "<index>. <title> <description>" — drop the ordinal prefix
  // so the per-token "Approve <name>" row is not mistaken for something else.
  const t = text.replace(/^\s*\d+\.\s*/, '').toLowerCase()
  if (t.includes('create migration account')) return 'deploy-hca'
  if (/approve \d+ registration/.test(t)) return `approve-registrations(${/approve (\d+) registration/.exec(t)[1]})`
  if (t.includes('approve registration')) return 'approve-registrations(?)'
  if (t.includes('approve wrapped names')) return 'approve-wrapped'
  if (t.includes('approve manager restoration')) return 'approve-manager-restoration'
  if (t.includes('revoke temporary hca access')) return 'cleanup-revoke'
  if (/upgrade batch (\d+) of (\d+)/.test(t)) {
    const m = /upgrade batch (\d+) of (\d+)/.exec(t)
    return `upgrade-batch-${m[1]}/${m[2]}`
  }
  if (/upgrade \d+ names?/.test(t)) return 'upgrade'
  if (/^approve /.test(t)) return 'approve-token'
  return `unknown(${text.slice(0, 40)})`
}

export async function launch({ headless = true } = {}) {
  const browser = await chromium.launch({ headless })
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[err] ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`))
  return { browser, ctx, page, logs }
}

/**
 * Open the dev-tools drawer on the Migration tab.
 *
 * Retried and tolerant of the drawer already being open: after a migration the
 * dashboard does a lot of indexer work and a fixed sleep is not enough — a bare
 * `click()` on the Migration tab times out, which is what broke A2 on the first
 * run. Also never re-clicks the opener when the drawer is already visible,
 * because that toggles it shut.
 */
export async function openMigrationPanel(page, { attempts = 4 } = {}) {
  const drawer = page.locator('[aria-label="ENS dev tools"]')
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(2500)
      await page.keyboard.press('Escape').catch(() => {})

      if (!(await drawer.isVisible().catch(() => false))) {
        const opener = page.getByRole('button', { name: 'Open ENS dev tools' })
        await opener.waitFor({ state: 'visible', timeout: 20000 })
        await opener.click()
      }
      await drawer.waitFor({ state: 'visible', timeout: 20000 })

      const tab = drawer.locator('button').filter({ hasText: 'Migration' }).first()
      await tab.waitFor({ state: 'visible', timeout: 20000 })
      await tab.click()
      // The panel is ready once the Migrate All control is rendered.
      await drawer
        .getByRole('button', { name: /Migrate All \(\d+\)/ })
        .waitFor({ state: 'visible', timeout: 20000 })
      return drawer
    } catch (e) {
      if (i === attempts - 1) throw e
      await page.waitForTimeout(3000)
    }
  }
  return drawer
}

export const connectAndOpenDevtools = (page) => openMigrationPanel(page)

export async function activeCount(drawer) {
  const t = await drawer.getByRole('button', { name: /Migrate All \(\d+\)/ }).textContent().catch(() => null)
  return t ? Number(/\((\d+)\)/.exec(t)?.[1] ?? 0) : 0
}

export async function seedName(page, drawer, preset, timeoutMs = 150000) {
  const before = await activeCount(drawer)
  await drawer.getByRole('button', { name: preset, exact: true }).click()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000)
    const err = await drawer.locator('text=/Failed to/').first().textContent().catch(() => null)
    if (err) throw new Error(`seed "${preset}" failed: ${err}`)
    if ((await activeCount(drawer)) > before) {
      const names = await drawer.locator('select').first().locator('option').allTextContents()
      return names.at(-1)
    }
  }
  throw new Error(`seed "${preset}" timed out`)
}

/** Remove every active name so the next scenario starts from a known selection. */
export async function clearActiveNames(page, drawer) {
  for (let i = 0; i < 40; i++) {
    if ((await activeCount(drawer)) === 0) return
    const btn = drawer.locator('button[title="Remove selected"]')
    if (!(await btn.count())) return
    await btn.first().click().catch(() => {})
    await page.waitForTimeout(400)
  }
}

/**
 * Dismiss the "Verify your wallet" modal on ANY route.
 *
 * dismissVerifyModal() below keys on the migration CTA, so it silently does
 * nothing on a profile or register page — where the modal still aria-hides the
 * whole document and every locator reads as absent.
 */
export async function dismissVerifyModalAnywhere(page) {
  for (let i = 0; i < 6; i++) {
    let clicked = false
    for (const label of [/Skip Anyway/i, /Skip for now/i]) {
      const b = page.locator('button').filter({ hasText: label })
      if (await b.count()) {
        await b.first().click().catch(() => {})
        clicked = true
        await page.waitForTimeout(1200)
        break
      }
    }
    if (!clicked) return true
  }
  return false
}

export async function dismissVerifyModal(page) {
  for (let i = 0; i < 8; i++) {
    const visible = await page.getByRole('button', { name: /upgrade \d+ names?/i }).count()
    if (visible > 0) return true
    let clicked = false
    for (const label of [/Skip Anyway/i, /Skip for now/i]) {
      const b = page.locator('button').filter({ hasText: label })
      if (await b.count()) {
        await b.first().click().catch(() => {})
        clicked = true
        await page.waitForTimeout(1200)
        break
      }
    }
    if (!clicked) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(900)
    }
  }
  return false
}

export async function gotoMigrationAll(page, drawer, waitMs = 15000) {
  await drawer.getByRole('button', { name: /Migrate All/ }).click()
  await page.waitForTimeout(waitMs)
  await dismissVerifyModal(page)
}

export async function readSummary(page) {
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  return {
    body,
    fee: /Estimated network fee: ~([\d.]+) ETH/.exec(body)?.[1] ?? null,
    confirmations: Number(/Expected: (\d+) wallet confirmation/.exec(body)?.[1] ?? NaN),
    oneConfirmation: /Expected: one wallet confirmation/i.test(body),
    upgradeLabel: /upgrade \d+ names?/i.exec(body)?.[0] ?? null,
    batchNote: /split into (\d+) gas-safe atomic batches/.exec(body)?.[1] ?? null,
    noEligible: /No eligible names found/i.test(body),
  }
}

export async function readStepsDialog(page) {
  const trigger = page.getByRole('button', { name: /wallet confirmations?$/ }).first()
  if (!(await trigger.count())) return { steps: [], kinds: [], desc: null }
  await trigger.click()
  await page.waitForTimeout(1500)
  const dialog = page.getByRole('dialog')
  const items = await dialog.locator('li').all()
  const steps = []
  for (const li of items) steps.push((await li.innerText()).replace(/\s+/g, ' ').trim())
  const desc = await dialog.locator('p').first().innerText().catch(() => '')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  return { steps, kinds: steps.map(classifyRow), desc }
}

/** Click the CTA and wait for terminal success or failure copy. */
export async function runMigration(page, timeoutMs = 300000) {
  await page.getByRole('button', { name: /upgrade \d+ names?/i }).first().click()
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
    last = body
    if (/has been upgraded|have been upgraded|upgraded!/i.test(body)) return { ok: true, body }
    if (/Gas estimate unavailable|Something went wrong|failed/i.test(body) && !/Estimating/i.test(body)) {
      return { ok: false, body }
    }
  }
  return { ok: false, timedOut: true, body: last }
}
