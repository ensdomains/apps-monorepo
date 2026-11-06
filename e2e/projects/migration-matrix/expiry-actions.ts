import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Browser, expect } from '@playwright/test'
import { labelhash, namehash, parseAbi, zeroAddress } from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
} from '../../fixtures/makeV1Name.js'
import { publicClient } from '../../helpers/anvil-client.js'
import { profileReadiness, queryFailures } from './diagnostics.js'
import { closeFixtureContext, routeToLocalFork } from './local-fork-routing.js'
import { overrideManagerFeatureFlags } from './matrix-fixture.js'
import type { NamespaceCheck } from './namespace-actions.js'
import { v2State } from './probes.js'
import type { seedConfiguration } from './seed.js'

/** Public date display against actual chain dates and the real indexer.
 * No inventory, registration date, expiry or name response is stubbed. */
export async function checkExpiryActions(
  browser: Browser,
  f: Awaited<ReturnType<typeof seedConfiguration>>,
  stage: 'before' | 'after',
  onCheck: (check: NamespaceCheck) => void,
) {
  for (const name of f.names) {
    const action = `expiry and grace display: ${name === f.leaf ? 'subject' : `${name.split('.').length}LD ancestor`}`
    const checkpoint = await publicClient.getBlock()
    const state = await v2State(name)
    const v2 = Boolean(state?.latestOwner && state.latestOwner !== zeroAddress)
    const root = name === f.root
    const wrapped = !v2 && f.wrappedFor(name)
    const expiry = v2
      ? state!.expiry
      : root
        ? await publicClient.readContract({
            address: V1_BASE_REGISTRAR,
            abi: parseAbi([
              'function nameExpires(uint256 id) view returns(uint256)',
            ]),
            functionName: 'nameExpires',
            args: [BigInt(labelhash(name.split('.')[0]))],
          })
        : wrapped
          ? (
              await publicClient.readContract({
                address: V1_NAME_WRAPPER,
                abi: parseAbi([
                  'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)',
                ]),
                functionName: 'getData',
                args: [BigInt(namehash(name))],
              })
            )[2]
          : null
    const never = expiry == null || expiry === 0n || expiry === (1n << 64n) - 1n
    const graceEnd =
      expiry == null ? null : expiry + BigInt(v2 ? 28 : 90) * 86400n
    const grace =
      root &&
      !never &&
      checkpoint.timestamp >= expiry! &&
      checkpoint.timestamp < graceEnd!
    let api: any
    try {
      await expect
        .poll(
          async () => {
            const response = await fetch(
              `${process.env.E2E_BIGNAME_URL}/v1/names/${name}`,
              { signal: AbortSignal.timeout(15000) },
            )
            if (!response.ok) return false
            api = await response.json()
            return (
              api.data?.name === name &&
              BigInt(api.meta?.as_of?.['11155111']?.block_number ?? 0) >=
                checkpoint.number
            )
          },
          {
            timeout: 120000,
            intervals: [1000, 2000, 4000],
            message:
              'Actual indexer must publish this date checkpoint before app navigation',
          },
        )
        .toBe(true)
    } catch (error) {
      for (const app of ['Manager', 'Explorer'] as const)
        onCheck({
          app,
          actor: 'Public view',
          stage,
          action,
          result: 'BLOCKED',
          detail: `Real name/indexer readiness was not established. No date-display pass is claimed: ${String(error)}`,
          evidence: { api, checkpoint: String(checkpoint.number) },
        })
      continue
    }
    for (const app of ['Manager', 'Explorer'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'UTC',
      })
      const page = await context.newPage()
      const out = resolve(
        process.env.REPLACEMENT_RESULTS!,
        'dates',
        f.c.config_id,
        stage,
        name,
        app,
      )
      mkdirSync(out, { recursive: true })
      let ready = false
      const row = (label: string) =>
        page.getByText(label, { exact: true }).locator('xpath=../..')
      try {
        await routeToLocalFork(page)
        await page.clock.install({
          time: new Date(Number(checkpoint.timestamp) * 1000),
        })
        if (app === 'Manager')
          await overrideManagerFeatureFlags(page, {
            'profile-view-new': true,
            migration: true,
          })
        await page.goto(
          app === 'Manager'
            ? `${process.env.MANAGER_APP_URL}/p/${name}`
            : `${process.env.PORTAL_APP_URL}/${name}/ownership`,
        )
        if (app === 'Manager')
          await expect
            .poll(
              async () => {
                const queries = await profileReadiness(page, name)
                return (
                  queries.some((q) => q.action === 'expiry') &&
                  queries.every((q) => q.status === 'success')
                )
              },
              { timeout: 90000 },
            )
            .toBe(true)
        else {
          await expect(
            page.getByRole('heading', { name: /Ownership$/ }).first(),
          ).toBeVisible({ timeout: 60000 })
          // Unwrapped and wrapped V1 children can have no registration row.
          // Observe the actual settled name-detail query instead of requiring
          // a field that is not part of those names' data model.
          await expect
            .poll(
              () =>
                page.evaluate(async (currentName) => {
                  const portalModule = '/src/utils/queryClient.ts'
                  const client = (await import(portalModule)).queryClient
                  return client
                    .getQueryCache()
                    .getAll()
                    .some(
                      (query: {
                        queryKey: readonly unknown[]
                        state: { status: string; data: unknown }
                      }) =>
                        query.queryKey[0] === 'name-detail' &&
                        (query.queryKey[1] as { name?: string } | undefined)
                          ?.name === currentName &&
                        query.state.status === 'success' &&
                        query.state.data != null,
                    )
                }, name),
              {
                timeout: 60000,
                message:
                  'Actual Explorer name-detail query must settle before checking dates',
              },
            )
            .toBe(true)
          await expect(
            page.getByText('Loading expiry and registration data', {
              exact: true,
            }),
          ).toHaveCount(0)
          await expect(
            page.getByText(
              'Error fetching registration data. Please refresh the page.',
              { exact: true },
            ),
          ).toHaveCount(0)
        }
        ready = true
        const checkDate = async (label: string, seconds: bigint) => {
          const date = new Date(Number(seconds) * 1000)
          // The latest profile abbreviates month labels. Assert the exact UTC
          // calendar date while accepting either presentation of that month.
          const dateAlternatives = (['long', 'short'] as const).map((month) =>
            new Intl.DateTimeFormat('en-US', {
              month,
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })
              .format(date)
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          await expect(row(label)).toContainText(
            new RegExp(`(?:${dateAlternatives.join('|')})`, 'i'),
          )
          if (app === 'Explorer') {
            const expectedTime = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'UTC',
            })
              .format(date)
              .replace(/\s/g, '')
              .toLowerCase()
            await expect(row(label)).toContainText(expectedTime)
          }
        }
        if (never)
          await expect(page.getByText('Expires', { exact: true })).toHaveCount(
            0,
          )
        else if (app === 'Manager')
          await checkDate('Expires', grace ? graceEnd! : expiry!)
        else {
          if (v2 && grace)
            await expect(
              page.getByText('Expires', { exact: true }),
            ).toHaveCount(0)
          else await checkDate('Expires', expiry!)
          if (grace) await checkDate('Grace ends', graceEnd!)
          else
            await expect(
              page.getByText('Grace ends', { exact: true }),
            ).toHaveCount(0)
        }
        const screen = await page.locator('body').innerText()
        writeFileSync(resolve(out, 'screen.txt'), screen)
        await page.screenshot({
          path: resolve(out, 'screen.png'),
          fullPage: true,
        })
        onCheck({
          app,
          actor: 'Public view',
          stage,
          action,
          result: 'PASS',
          detail:
            'Public date display checked against the actual registrar/wrapper/V2 expiry and protocol grace duration, using the real published name API. Non-expiring names must not acquire an invented expiry. Registration date is captured but has a separate preservation requirement.',
          evidence: {
            name,
            protocol: v2 ? 'V2' : 'V1',
            expiry: expiry?.toString() ?? null,
            grace,
            never,
            checkpoint: String(checkpoint.number),
            api,
            screen,
          },
        })
      } catch (error) {
        const screen = await page
          .locator('body')
          .innerText()
          .catch(() => '')
        writeFileSync(resolve(out, 'screen.txt'), screen)
        await page
          .screenshot({ path: resolve(out, 'screen.png'), fullPage: true })
          .catch(() => {})
        onCheck({
          app,
          actor: 'Public view',
          stage,
          action,
          result: ready && screen.trim() ? 'FAIL' : 'BLOCKED',
          detail: String(error),
          evidence: {
            name,
            protocol: v2 ? 'V2' : 'V1',
            expiry: expiry?.toString() ?? null,
            grace,
            never,
            checkpoint: String(checkpoint.number),
            api,
            screen,
            queryFailures: await queryFailures(page),
            ...(app === 'Manager'
              ? { profileQueries: await profileReadiness(page, name) }
              : {}),
          },
        })
      } finally {
        await closeFixtureContext(context)
      }
    }
  }
}
