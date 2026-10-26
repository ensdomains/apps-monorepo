import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeResolverRoleBitmap } from '@ensdomains/ensjs/utils/v2'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { type Browser, expect, type Page } from '@playwright/test'
import {
  decodeFunctionResult,
  encodeFunctionData,
  labelhash,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../fixtures/makeV1Name.js'
import {
  connectHeadless,
  localSepolia,
  overrideManagerFeatureFlags,
} from '../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../helpers/anvil-client.js'
import {
  authorizeTransactionsWhile,
  connectWithHeadlessWallet as connectManager,
  dismissMatrixBackendOverlay,
  PERMITTED_SIGN_KINDS,
} from '../../helpers/manager-auth.js'
import { createBignameMock } from '../../helpers/mock-bigname.js'
import { connectWithHeadlessWallet as connectExplorer } from '../../helpers/portal-auth.js'
import { mockV1Names } from '../../helpers/record-audit-inventory.js'
import {
  dnsEncode,
  resolveRecords,
  resolverFor,
} from '../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../helpers/transaction-modal.js'
import { installChainRoleDiscovery } from './chain-discovery.js'
import {
  permissionQueries,
  profileReadiness,
  queryFailures,
} from './diagnostics.js'
import { closeFixtureContext, routeToLocalFork } from './local-fork-routing.js'
import { beforePermissions, v2State } from './probes.js'
import { account, accountKey, type seedConfiguration, send } from './seed.js'
import { rethrowUnsettledWallet } from './workflow-check.js'

type Fixture = Awaited<ReturnType<typeof seedConfiguration>>
type Result = {
  result: 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A'
  detail: string
  evidence?: unknown
  elapsedMs?: number
}
type ActionEvidence = {
  app: string
  actor: string
  stage: string
  inventoryVersion: string
  storedDescriptionOracleVersion: string
  editorReadinessVersion: string
  checks: Record<string, Result>
  screens: Record<string, string>
  queryFailures?: unknown
  requestFailures?: unknown[]
  pageErrors: string[]
}
const bignameRoute = /(?:bigname\.sh|(?:localhost|127\.0\.0\.1):\d+)\/v1\//

export async function installInventory(
  page: Page,
  f: Fixture,
  stage: 'before' | 'after',
) {
  const checkpointTime = Number((await publicClient.getBlock()).timestamp)
  const mock = createBignameMock({ nowSeconds: () => checkpointTime })
  await mock.install(page)
  await installChainRoleDiscovery(page, f)
  // Discovery only: the fixture grants root resolver roles, never setter scopes.
  // Return the real current bitmaps for all fixture participants. The app still
  // checks each permission against the contract before enabling an action.
  await page.route(
    /\/v1\/resolvers\/11155111\/0x[a-fA-F0-9]{40}\/roles(?:\?|$)/,
    async (route) => {
      const resolver = new URL(route.request().url()).pathname.split(
        '/',
      )[4] as `0x${string}`
      if (resolver.toLowerCase() === V1_PUBLIC_RESOLVER.toLowerCase()) {
        await route.fulfill({
          status: 404,
          json: {
            error: {
              code: 'unsupported',
              message: 'V1 PublicResolver has no EAC role collection',
            },
          },
        })
        return
      }
      const data = []
      try {
        for (const id of [
          'W1',
          'W2',
          'W3',
          'W4',
          'Operator',
          'Resolver delegate',
          'Unrelated',
        ]) {
          const raw = await publicClient.readContract({
            address: resolver,
            abi: parseAbi([
              'function roles(uint256 resource,address user) view returns(uint256)',
            ]),
            functionName: 'roles',
            args: [0n, account(id).address],
          })
          if (raw === 0n) continue
          const powers = decodeResolverRoleBitmap(raw).map((role) => {
            const admin = role.endsWith('_ADMIN')
            const bare = role
              .replace(/^ROLE_/, '')
              .replace(/_ADMIN$/, '')
              .toLowerCase()
              .replace('set_address', 'set_addr')
            return `${admin ? 'admin_' : ''}${bare}`
          })
          data.push({
            address: account(id).address,
            registration_id: `fixture-${f.c.config_id}`,
            powers,
            eac_resource: '0',
          })
        }
      } catch (error) {
        await route.fulfill({
          status: /revert/i.test(String(error)) ? 404 : 503,
          json: {
            error: {
              code: 'fixture_inventory_unavailable',
              message:
                'Resolver role inventory could not be read from the chain',
            },
          },
        })
        return
      }
      await route.fulfill({
        json: {
          data,
          page: {
            cursor: null,
            next_cursor: null,
            page_size: data.length,
            total_count: data.length,
            has_more: false,
          },
          meta: {},
        },
      })
    },
  )
  // A refused migration remains V1, and a native child can be V1 while its
  // ancestor is already V2. Choose each discovery shape from actual registry
  // state, rather than treating the checkpoint name as a protocol version.
  const states = new Map(
    await Promise.all(
      f.names.map(async (name) => [name, await v2State(name)] as const),
    ),
  )
  // A lapsed V2 registration still has a latest holder even though status is
  // no longer registered. A reserved, unmigrated V1 label has no V2 holder.
  const isV2 = (name: string) =>
    Boolean(
      states.get(name) &&
        states.get(name)!.latestOwner.toLowerCase() !== zeroAddress,
    )
  const legacyNames = (await f.metadata()).filter((name) => !isV2(name.name))
  if (legacyNames.length) await mockV1Names(page, legacyNames)
  await page.route(/\/v1\/names\/[^/]+\/subnames(?:\?|$)/, async (route) => {
    const parent = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/')[3],
    )
    if (!f.names.includes(parent) || !isV2(parent)) return route.fallback()
    const data = []
    for (const name of f.names.filter(
      (name) => name.split('.').slice(1).join('.') === parent,
    )) {
      const state = await v2State(name)
      if (state?.status !== 2) continue
      data.push({
        name,
        display_name: name,
        namespace: 'ens',
        namehash: namehash(name),
        labelhash: labelhash(name.split('.')[0]),
        owner: state.latestOwner,
        status: 'active',
        authority: 'ens_v2',
        expires_at: String(state.expiry),
        subname_count: f.names.filter(
          (child) => child.split('.').slice(1).join('.') === name,
        ).length,
      })
    }
    await route.fulfill({
      json: {
        data,
        page: {
          cursor: null,
          next_cursor: null,
          page_size: data.length,
          total_count: data.length,
          has_more: false,
        },
        meta: {
          fixture_source: 'Fresh fixture names with actual V2 registry state',
        },
      },
    })
  })
  for (const name of f.names) {
    const state = states.get(name)
    if (!state || !isV2(name)) continue
    const records = name === f.leaf ? f.records : f.recordsFor(name)
    mock.addName({
      name,
      owner: state.latestOwner,
      protocol: 'v2',
      resolver: await publicClient.readContract({
        address: state.registry,
        abi: parseAbi([
          'function getResolver(string label) view returns(address)',
        ]),
        functionName: 'getResolver',
        args: [state.label],
      }),
      expiryDate: Number(state.expiry),
      records: [...records.texts!],
      recordInventory: {
        knownKeys: [
          ...records.texts!.map((t) => `text:${t.key}`),
          ...records.addresses!.map((a) => `addr:${a.coinType}`),
          ...(records.contenthash ? ['contenthash'] : []),
          ...records.interfaces!.map((i) => `interface:${i.interfaceId}`),
          'pubkey',
        ],
        abiContentTypes: records.abis!.map((a) => a.contentType),
      },
    })
  }
}

/** Real app navigation and wallet writes. Only discovery is stubbed; no permissions or transactions are mocked. */
export async function checkActorUI(
  browser: Browser,
  f: Fixture,
  actor: string,
  stage: 'before' | 'after',
  canWrite: boolean,
  writes = true,
  artifactStage: string = stage,
) {
  const result: ActionEvidence[] = []
  const description = f.records.texts![1]
  const baselineResolution = await resolveRecords(f.leaf, f.records)
  const liveDescription = (
    await resolveRecords(f.leaf, { texts: [description] })
  )[0]
  // Use live expiry, not the fixture's original lifecycle: the renewal recovery
  // test deliberately reuses this fixture after renewing its ancestor.
  const rootState = await v2State(f.root)
  const rootIsV2 = Boolean(
    rootState && rootState.latestOwner.toLowerCase() !== zeroAddress,
  )
  const rootExpiry = rootIsV2
    ? rootState!.expiry
    : await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi([
          'function nameExpires(uint256 id) view returns(uint256)',
        ]),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(f.label))],
      })
  const checkpointTime = (await publicClient.getBlock()).timestamp
  const renewalRequired =
    checkpointTime >= rootExpiry &&
    checkpointTime < rootExpiry + BigInt(rootIsV2 ? 28 : 90) * 86_400n
  const editingPolicy = {
    decision: '2026-10-24 user: require renewal before editing',
    renewalRequired,
    protocol: rootIsV2 ? 'V2' : 'V1',
    expiry: String(rootExpiry),
    checkpoint: String(checkpointTime),
  }
  const lifecycleResolutionUnavailable =
    liveDescription.got !== liveDescription.want &&
    (f.c.root_lifecycle === 'Grace' || f.c.name_expiry.startsWith('Expired'))
  const independentV1Roles =
    stage === 'before' &&
    f.c.level === '2LD' &&
    f.c.root_type === 'Unwrapped' &&
    actor !== 'Disconnected'
      ? await beforePermissions(f, actor)
      : undefined
  const checkIndependentRole = async (
    page: Page,
    role: 'owner' | 'manager',
  ): Promise<Result> => {
    const managerAuthorities = [
      independentV1Roles?.assignManagerAsOwner,
      independentV1Roles?.editManager,
    ]
    const authority =
      role === 'owner'
        ? independentV1Roles?.transfer
        : (managerAuthorities.find((p) => p?.result === 'ALLOWED') ??
          managerAuthorities.find((p) => p?.result === 'BLOCKED') ??
          independentV1Roles?.editManager)
    if (!authority || authority.result === 'BLOCKED')
      return {
        result: 'BLOCKED',
        detail: 'Independent V1 role authority could not be established.',
      }
    const entry = page
      .getByRole('button', {
        name: new RegExp(
          `^(Edit roles|Change ${role}|Edit ${role}|Set ${role})$`,
          'i',
        ),
      })
      .or(
        page.getByRole('link', {
          name: new RegExp(
            `^(Edit roles|Change ${role}|Edit ${role}|Set ${role})$`,
            'i',
          ),
        }),
      )
    const available =
      (await entry.count()) > 0 && (await entry.first().isVisible())
    if (authority.result === 'DENIED')
      return {
        result: available ? 'FAIL' : 'PASS',
        detail: available
          ? `Independent ${role} entry offered despite a denied contract call; submission gate needs review.`
          : `No independent ${role} edit offered to this wallet, matching its denied contract call.`,
      }
    return available
      ? {
          result: 'BLOCKED',
          detail: `Independent ${role} control is present; its committed isolated-role outcome has not yet been exercised.`,
        }
      : {
          result: 'FAIL',
          detail: `Contract permits changing only the V1 ${role}, but this loaded app surface has no independent ${role} edit. Full name transfer is a separate workflow and does not prove preservation of the other role.`,
          evidence: { authority },
        }
  }
  const runApp = async (app: 'Manager' | 'Explorer') => {
    const evidence: ActionEvidence = {
      app,
      actor,
      stage: artifactStage,
      inventoryVersion: 'actual-protocol-and-chain-time-v3',
      storedDescriptionOracleVersion: 'configured-resolver-resolve-v1',
      editorReadinessVersion: 'exact-editor-denial-v2',
      checks: {},
      screens: {},
      requestFailures: [],
      pageErrors: [],
    }
    result.push(evidence)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.on('requestfailed', (request) => {
      const url = new URL(request.url())
      evidence.requestFailures!.push({
        url: `${url.origin}${url.pathname}`,
        error: request.failure()?.errorText,
      })
    })
    page.on('pageerror', (error) =>
      evidence.pageErrors.push(String(error).slice(0, 2000)),
    )
    const directory = resolve(
      process.env.REPLACEMENT_RESULTS ?? 'test-results/migration-matrix',
      'ui',
      f.c.config_id,
      actor.replaceAll(' ', '-'),
      artifactStage,
      app,
    )
    mkdirSync(directory, { recursive: true })
    const screenshot = async (key: string) => {
      const body = await page.locator('body').innerText()
      writeFileSync(resolve(directory, `${key}.txt`), body)
      await page.screenshot({
        path: resolve(directory, `${key}.png`),
        fullPage: true,
      })
      evidence.screens[key] = body
    }
    const run = async (key: string, fn: () => Promise<Result>) => {
      const began = Date.now()
      try {
        evidence.checks[key] = await fn()
      } catch (error) {
        const detail = String(error)
        const blockedByAuth =
          /locator handler has finished|intercepting action to run the handler/.test(
            detail,
          ) && detail.includes('Verify your wallet')
        const blockedByWallet = detail.includes(
          'Local matrix wallet request did not settle',
        )
        const blockedByBrowser =
          page.isClosed() ||
          /Test ended|Target page, context or browser has been closed/.test(
            detail,
          )
        evidence.checks[key] = {
          result:
            blockedByAuth || blockedByWallet || blockedByBrowser
              ? 'BLOCKED'
              : 'FAIL',
          detail: blockedByAuth
            ? `Local test auth overlay did not dismiss before the assertion. Rerun required; this does not prove missing records. ${detail.slice(0, 1500)}`
            : blockedByBrowser
              ? `Browser session ended before this assertion completed; fresh execution required. ${detail.slice(0, 1500)}`
              : detail.slice(0, 2000),
        }
        await screenshot(`${key}-failed`).catch(() => {})
        // Save the interrupted action before unwinding this whole fixture.
        writeFileSync(
          resolve(directory, 'observations.json'),
          JSON.stringify(evidence, null, 2),
        )
        rethrowUnsettledWallet(error)
      }
      evidence.checks[key].elapsedMs = Date.now() - began
      writeFileSync(
        resolve(directory, 'observations.json'),
        JSON.stringify(evidence, null, 2),
      )
    }
    try {
      const now = await publicClient.getBlock()
      await routeToLocalFork(page)
      if (app === 'Manager')
        await page.addLocatorHandler(
          page.getByRole('alertdialog', { name: 'Verify your wallet' }),
          () => dismissMatrixBackendOverlay(page),
        )
      await page.clock.install({ time: new Date(Number(now.timestamp) * 1000) })
      await installInventory(page, f, stage)
      const wallet = await injectHeadlessWeb3Provider({
        page,
        privateKeys: [accountKey(actor === 'Disconnected' ? 'W1' : actor)],
        chains: [localSepolia],
        permitted: [...PERMITTED_SIGN_KINDS],
      })
      if (app === 'Manager')
        await overrideManagerFeatureFlags(page, {
          'profile-view-new': true,
          migration: true,
          'migration-subname-recreation': f.c.recreation_flag !== 'OFF',
        })
      const base =
        app === 'Manager'
          ? process.env.MANAGER_APP_URL!
          : process.env.PORTAL_APP_URL!
      const profileURL = `${base}/${app === 'Manager' ? 'p/' : ''}${f.leaf}${app === 'Explorer' ? '/records' : ''}`
      await page.goto(profileURL, { waitUntil: 'domcontentloaded' })
      if (actor !== 'Disconnected') {
        if (app === 'Manager') {
          await connectManager(page, wallet)
          // The installed locator handler dismisses this optional modal if it
          // appears; do not sleep for an absent overlay in every wallet view.
          if (
            await page
              .getByRole('alertdialog', { name: 'Verify your wallet' })
              .isVisible()
          )
            await dismissMatrixBackendOverlay(page)
        } else await connectExplorer(page, wallet)
      }
      const visit = async (url: string) => {
        if (page.url() === url) return
        const link = page
          .locator(`a[href="${new URL(url).pathname}"]:visible`)
          .first()
        if (await link.isVisible()) {
          await link.click()
          await expect(page).toHaveURL(url, { timeout: 60000 })
        } else await page.goto(url, { waitUntil: 'domcontentloaded' })
      }
      await run('recordsVisible', async () => {
        await visit(profileURL)
        const sentinel = f.records.texts![1].value
        if (lifecycleResolutionUnavailable) {
          // A record that already fails universal resolution cannot be required
          // to appear as resolved content. Preserve the loaded UI as evidence;
          // exact source storage and before/after resolution remain separate.
          const loaded =
            app === 'Explorer'
              ? page.getByRole('heading', { name: /Records$/i }).first()
              : page.getByText('Owner', { exact: true }).first()
          await expect(loaded).toBeVisible({ timeout: 60000 })
          await screenshot('records-unresolved-lifecycle')
          return {
            result: 'N/A',
            detail:
              'The description does not currently resolve at this grace/expiry checkpoint. Loaded app state captured; source-record preservation and before/after resolution are checked separately. This is not proof that migration lost records.',
            evidence: { liveDescription },
          }
        }
        await expect(
          page.getByText(sentinel, { exact: true }).first(),
        ).toBeVisible({ timeout: app === 'Manager' ? 180000 : 90000 })
        await screenshot('records')
        return {
          result: 'PASS',
          detail:
            'The seeded description is visible. Full record preservation is verified separately on chain.',
        }
      })
      if (app === 'Manager')
        await run('ownerDisplay', async () => {
          try {
            await expect
              .poll(
                async () => {
                  const queries = await profileReadiness(page, f.leaf)
                  return (
                    queries.some((q) => q.action === 'owner') &&
                    queries.every((q) => q.status !== 'pending')
                  )
                },
                {
                  timeout: 90000,
                  message:
                    'Actual owner/expiry queries settle before judging the ownership display',
                },
              )
              .toBe(true)
          } catch (error) {
            return {
              result: 'BLOCKED',
              detail: `Owner/expiry readiness was not established; the skeleton is not a confirmed wrong-ownership display. ${String(error).slice(0, 600)}`,
              evidence: await profileReadiness(page, f.leaf),
            }
          }
          if (
            await page
              .getByRole('alertdialog', { name: 'Verify your wallet' })
              .isVisible()
          )
            await dismissMatrixBackendOverlay(page)
          const owner = page
            .getByText('Owner', { exact: true })
            .locator('xpath=../..')
            .getByRole('link')
            .first()
          const state = await v2State(f.leaf)
          const hasV2Holder = Boolean(
            state?.latestOwner && state.latestOwner !== zeroAddress,
          )
          const wrapperData =
            !hasV2Holder && f.wrappedFor(f.leaf)
              ? await publicClient.readContract({
                  address: V1_NAME_WRAPPER,
                  abi: parseAbi([
                    'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)',
                  ]),
                  functionName: 'getData',
                  args: [BigInt(namehash(f.leaf))],
                })
              : undefined
          const expected =
            state?.status === 2
              ? state.latestOwner
              : (wrapperData?.[0] ??
                account(
                  f.c.level === '2LD'
                    ? f.c.root_owner
                    : f.c.name_holder.startsWith('W')
                      ? f.c.name_holder
                      : f.c.name_manager,
                ).address)
          const ownershipEvidence = {
            expected,
            oracleVersion: 'live-wrapper-holder-v1',
            ...(wrapperData
              ? {
                  wrapperAddress: V1_NAME_WRAPPER,
                  wrapperOwner: wrapperData[0],
                  wrapperFuses: wrapperData[1],
                  wrapperExpiry: String(wrapperData[2]),
                }
              : {}),
          }
          if (expected === zeroAddress) {
            const href = (await owner.count())
              ? await owner.getAttribute('href')
              : null
            return {
              result: href ? 'FAIL' : 'PASS',
              detail: href
                ? 'NameWrapper reports no current holder at this expiry checkpoint, but Manager still links an address as the current Owner. A previous owner must not be presented as current ownership.'
                : 'The actual wrapper has no current holder at this expiry checkpoint; Manager does not link a current Owner.',
              evidence: { ...ownershipEvidence, href },
            }
          }
          await expect(owner).toBeVisible({ timeout: 30000 })
          const href = await owner.getAttribute('href')
          const correct = href?.toLowerCase().includes(expected.toLowerCase())
          return {
            result: correct ? 'PASS' : 'FAIL',
            detail: correct
              ? 'Displayed Owner links to the actual token holder/controller for this name type.'
              : 'Displayed Owner points to a different wallet from the legacy token holder. For an unwrapped 2LD, distinguish registrant from manager.',
            evidence: { ...ownershipEvidence, href },
          }
        })
      if (app === 'Manager' && independentV1Roles)
        for (const role of ['owner', 'manager'] as const)
          await run(
            `independent${role === 'owner' ? 'Owner' : 'Manager'}Edit`,
            () => checkIndependentRole(page, role),
          )
      await run('editRecords', async () => {
        const pageErrorStart = evidence.pageErrors.length
        if (app === 'Explorer') await visit(`${base}/${f.leaf}/edit-records`)
        if (app === 'Manager' && actor !== 'Disconnected') {
          // The profile deliberately disables its permission query while its
          // loaded grace banner gates editing. Check that actual UI gate rather
          // than waiting for a query the app will never execute in this state.
          const graceGate = page
            .getByText(/^(Your|This) name is in grace period$/)
            .filter({ visible: true })
            .first()
          try {
            await expect
              .poll(
                async () =>
                  (await graceGate.isVisible()) ||
                  (await permissionQueries(page)).some((q) => {
                    const key = JSON.stringify(q.key).toLowerCase()
                    return (
                      key.includes('resolver_write_access') &&
                      key.includes(JSON.stringify(f.leaf.toLowerCase())) &&
                      key.includes(account(actor).address.toLowerCase()) &&
                      q.status !== 'pending'
                    )
                  }),
                {
                  timeout: 90000,
                  message:
                    'Wait for the actual connected-wallet permission result or the explicit loaded grace gate',
                },
              )
              .toBe(true)
          } catch (error) {
            return {
              result: 'BLOCKED',
              detail: `Permission readiness was not established: ${String(error).slice(0, 900)}`,
            }
          }
        }
        const directEdit = page
          .getByRole('button', { name: /^(Edit Profile|Edit)$/ })
          .first()
        const copyEdit = page
          .getByRole('button', {
            name: /^(Copy & edit records|Upgrade resolver)$/,
          })
          .first()
        let button =
          app === 'Manager'
            ? directEdit.or(copyEdit).first()
            : page.getByLabel('Type', { exact: true })
        // The wallet picker can still be closing after its connected state is
        // established. Its "Connect a wallet" text is not an editor denial.
        const denialTitles = [
          'Permission Denied',
          'Permissions unavailable',
          ...(actor === 'Disconnected' ? ['Wallet Not Connected'] : []),
          ...(lifecycleResolutionUnavailable ? ['Name not found'] : []),
        ]
        const unavailable =
          app === 'Manager'
            ? page
                .getByRole('link', { name: /Upgrade|Renew/i })
                .or(page.getByRole('button', { name: /Upgrade|Renew/i }))
                .first()
            : page
                .getByText(new RegExp(`^(${denialTitles.join('|')})$`))
                .first()
        if (app === 'Explorer') {
          try {
            await expect(button.or(unavailable).first()).toBeVisible({
              timeout: 60000,
            })
          } catch (error) {
            await screenshot('editor-not-ready')
            const body = evidence.screens['editor-not-ready']
            const pageErrors = evidence.pageErrors.slice(pageErrorStart)
            const loadedError =
              /Something went wrong|Error loading|Could not find|couldn't confirm|Unexpected error/i.test(
                body,
              )
            return {
              result: loadedError || pageErrors.length ? 'FAIL' : 'BLOCKED',
              detail:
                loadedError || pageErrors.length
                  ? 'Explorer failed to render its record editor or permission denial, with an explicit app error. The error is preserved; no authorization conclusion is inferred.'
                  : 'Explorer did not finish loading an editor or permission denial within 60 seconds. No permission or record-edit assertion completed; rerun required.',
              evidence: {
                body,
                pageErrors,
                queryFailures: await queryFailures(page),
                error: String(error).slice(0, 800),
              },
            }
          }
        }
        if (app === 'Manager')
          button = (await directEdit.isVisible()) ? directEdit : copyEdit
        await screenshot('editor-access')
        if (
          app === 'Explorer' &&
          (await page
            .getByText('Permissions unavailable', { exact: true })
            .isVisible())
        )
          return {
            result: 'BLOCKED',
            detail:
              'The app could not read resolver permissions; this is not a successful authorization denial. Check indexer/RPC evidence.',
          }
        if (
          app === 'Explorer' &&
          !(await button.isVisible()) &&
          !(await unavailable.isVisible())
        )
          return {
            result: 'BLOCKED',
            detail:
              'The editor or its explicit denial was no longer present at the assertion checkpoint. Neither missing access nor successful permission enforcement is established; fresh fixture required.',
            evidence: {
              url: page.url(),
              body: evidence.screens['editor-access'],
            },
          }
        const available =
          (await button.isVisible()) && (await button.isEnabled())
        if (!canWrite || actor === 'Disconnected') {
          if (
            available &&
            app === 'Manager' &&
            /Copy|Upgrade resolver/i.test(await button.innerText())
          )
            return {
              result: 'N/A',
              detail:
                'Resolver copy is offered instead of direct writes; S4 checks verify that recovery route.',
            }
          return {
            result: available ? 'FAIL' : 'PASS',
            detail: available
              ? 'Edit entry is offered to a wallet with no direct write authority; inspect submission gate.'
              : 'Direct record editing is unavailable to this wallet.',
          }
        }
        if (!available && renewalRequired)
          return {
            result: 'PASS',
            detail:
              'Renewal required before editing: the app exposes no usable direct editor while the name or its ancestor is in grace, as required by the user-confirmed policy. Actual contract authority and record storage are reported separately; renewal recovery is a separate test.',
            evidence: {
              editingPolicy,
              permissions: await permissionQueries(page),
            },
          }
        if (!available)
          return {
            result: 'FAIL',
            detail: `${app} has no usable edit entry although the exact resolver call is authorized. Test the other app as a workaround.`,
            evidence: await permissionQueries(page),
          }
        if (
          app === 'Manager' &&
          /Copy|Upgrade resolver/i.test(await button.innerText())
        )
          return {
            result: 'FAIL',
            detail:
              'Direct editing is unavailable although the legacy resolver authorizes this wallet. A resolver-copy route is offered; its actual preservation is assessed by the separate S4 test.',
          }
        if (!writes)
          return {
            result: renewalRequired ? 'BLOCKED' : 'PASS',
            detail: renewalRequired
              ? 'An editor is available during grace; submission must be tested against the renewal-first policy.'
              : 'Authorized edit entry is available; mutation not requested in this UI observation.',
            evidence: { editingPolicy },
          }
        const value = `${f.c.config_id} ${actor} ${app} ${stage} write`
        let readback: Awaited<ReturnType<typeof resolveRecords>> = []
        let sourceReadback: string | undefined
        let restored: Awaited<ReturnType<typeof send>> | undefined
        const configuredResolver = async () => {
          const state = await v2State(f.leaf)
          return state?.status === 2
            ? publicClient.readContract({
                address: state.registry,
                abi: parseAbi([
                  'function getResolver(string label) view returns(address)',
                ]),
                functionName: 'getResolver',
                args: [state.label],
              })
            : publicClient.readContract({
                address: V1_ENS_REGISTRY,
                abi: parseAbi([
                  'function resolver(bytes32 node) view returns(address)',
                ]),
                functionName: 'resolver',
                args: [namehash(f.leaf)],
              })
        }
        const readStoredDescription = async () => {
          const resolver = await configuredResolver()
          const legacy =
            resolver.toLowerCase() === V1_PUBLIC_RESOLVER.toLowerCase()
          const textABI = parseAbi([
            'function text(bytes32 node,string key) view returns(string)',
          ])
          const read = {
            abi: textABI,
            functionName: 'text' as const,
            args: [namehash(f.leaf), 'description'] as const,
          }
          if (legacy)
            return publicClient.readContract({ address: resolver, ...read })
          // PermissionedResolver dispatches legacy getter calldata through
          // resolve(name, data). A direct text(bytes, string) getter does not
          // exist, even though its setter accepts the DNS-encoded name.
          const data = await publicClient.readContract({
            address: resolver,
            abi: parseAbi([
              'function resolve(bytes name,bytes data) view returns(bytes)',
            ]),
            functionName: 'resolve',
            args: [dnsEncode(f.leaf), encodeFunctionData(read)],
          })
          return decodeFunctionResult({ ...read, data })
        }
        try {
          if (app === 'Manager') {
            await button.click()
            await page
              .getByLabel('Profile Description', { exact: true })
              .fill(value)
            await page
              .getByRole('button', { name: 'Preview', exact: true })
              .click()
            let done = false
            const authorizing = authorizeTransactionsWhile(
              page,
              wallet,
              () => done,
            )
            try {
              await page
                .getByRole('button', { name: 'Publish changes', exact: true })
                .click()
              await expect
                .poll(
                  async () =>
                    lifecycleResolutionUnavailable
                      ? readStoredDescription()
                      : (
                          await resolveRecords(f.leaf, {
                            texts: [{ key: 'description', value }],
                          })
                        )[0].got,
                  { timeout: 90000 },
                )
                .toBe(value)
            } finally {
              done = true
              await authorizing
            }
          } else {
            await button.selectOption('text')
            await page.getByLabel('Key', { exact: true }).fill('description')
            await page.getByLabel('Value', { exact: true }).fill(value)
            await page
              .getByRole('button', { name: 'Add record', exact: true })
              .click()
            await page
              .getByRole('button', { name: /^Save \d+ changes?$/ })
              .click()
            await driveTransactionsToSuccess(
              page,
              wallet,
              ['tx-save-resolver-records'],
              90000,
            )
          }
          readback = await resolveRecords(f.leaf, {
            texts: [{ key: 'description', value }],
          })
          if (lifecycleResolutionUnavailable) {
            sourceReadback = await readStoredDescription()
            expect(sourceReadback).toBe(value)
          } else expect(readback[0].got).toBe(value)
        } finally {
          // Restore through the same authorized wallet, without granting any rights.
          // UniversalResolver can report a V1 compatibility adapter. Writes go
          // to the actual configured resolver, never to that read adapter.
          const resolver = await configuredResolver()
          const legacy =
            resolver.toLowerCase() === V1_PUBLIC_RESOLVER.toLowerCase()
          const abi = parseAbi([
            legacy
              ? 'function setText(bytes32 node,string key,string value)'
              : 'function setText(bytes name,string key,string value)',
          ])
          restored = await send(
            account(actor),
            resolver,
            encodeFunctionData({
              abi,
              functionName: 'setText',
              args: [
                legacy ? namehash(f.leaf) : dnsEncode(f.leaf),
                'description',
                f.records.texts![1].value,
              ],
            }),
          )
          expect(await readStoredDescription()).toBe(description.value)
          expect(await resolveRecords(f.leaf, f.records)).toEqual(
            baselineResolution,
          )
        }
        return {
          result: renewalRequired ? 'FAIL' : 'PASS',
          detail: renewalRequired
            ? 'The app committed a record edit during grace without renewal, contrary to the user-confirmed renewal-first policy. Verified the written value and restored the exact baseline.'
            : lifecycleResolutionUnavailable
              ? 'Submitted a distinct record value through the app and verified the actual configured resolver storage. Universal resolution was already unavailable at this lifecycle checkpoint; no resolution recovery is claimed. Restored the source value and exact baseline resolution.'
              : 'Submitted a distinct record value through the app and verified resolution; then restored the baseline through an authorized transaction.',
          evidence: {
            editingPolicy,
            readback,
            sourceReadback,
            restorationHash: restored?.transactionHash,
          },
        }
      })
      if (app === 'Explorer') {
        for (const path of ['ownership', 'roles', 'subnames'])
          await run(path, async () => {
            await visit(`${base}/${f.leaf}/${path}`)
            const heading = page
              .getByRole('heading', { name: new RegExp(`${path}$`, 'i') })
              .first()
            await expect(
              path === 'subnames'
                ? heading
                    .or(page.getByText('No subregistry', { exact: true }))
                    .first()
                : heading,
            ).toBeVisible({ timeout: 60000 })
            const identities: Record<string, unknown> = {}
            if (
              path === 'ownership' &&
              f.c.root_lifecycle === 'Active' &&
              !f.c.name_expiry.startsWith('Expired')
            ) {
              const ownerId =
                f.c.level === '2LD'
                  ? f.c.root_owner
                  : f.c.name_holder.startsWith('W')
                    ? f.c.name_holder
                    : f.c.name_manager
              const expected = {
                Owner: account(ownerId).address,
                ...(stage === 'before' && !f.wrappedFor(f.leaf)
                  ? { Manager: f.holderFor(f.leaf).address }
                  : {}),
              }
              for (const [label, address] of Object.entries(expected)) {
                const row = page
                  .getByText(label, { exact: true })
                  .locator('xpath=../..')
                const link = row.locator(`a[href="/addr/${address}" i]`).first()
                await expect(
                  link,
                  `${label} row must identify the exact wallet after loading`,
                ).toHaveCount(1, { timeout: 60000 })
                identities[label] = {
                  address,
                  links: await row
                    .locator('a')
                    .evaluateAll((nodes) =>
                      nodes.map((node) => node.getAttribute('href')),
                    ),
                }
              }
            }
            if (path === 'roles' && independentV1Roles) {
              await expect(
                page.getByText(
                  'Role management is only available for ENSv2 names.',
                  { exact: true },
                ),
              ).toBeVisible({ timeout: 60000 })
              for (const role of ['owner', 'manager'] as const)
                await run(
                  `independent${role === 'owner' ? 'Owner' : 'Manager'}Edit`,
                  () => checkIndependentRole(page, role),
                )
            }
            await screenshot(path)
            return {
              result: 'PASS',
              detail: Object.keys(identities).length
                ? 'Exact Owner/Manager wallet links verified after loading. Other action workflows are reported separately.'
                : 'Page and available actions captured; this observation does not certify every action workflow.',
              evidence: identities,
            }
          })
      }
    } catch (error) {
      evidence.checks.session = {
        result: 'BLOCKED',
        detail: String(error).slice(0, 1800),
      }
      rethrowUnsettledWallet(error)
    } finally {
      evidence.queryFailures = await queryFailures(page)
      writeFileSync(
        resolve(directory, 'observations.json'),
        JSON.stringify(evidence, null, 2),
      )
      await closeFixtureContext(context)
    }
  }
  // Read-only app sessions can browse together; all authorized writes remain
  // sequential so each mutation/readback/restoration has an isolated baseline.
  if (canWrite && writes)
    for (const app of ['Manager', 'Explorer'] as const) await runApp(app)
  else await Promise.all((['Manager', 'Explorer'] as const).map(runApp))
  return result
}
