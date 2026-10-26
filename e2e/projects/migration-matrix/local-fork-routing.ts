import {
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  request as playwrightRequest,
} from '@playwright/test'

// Playwright routing disables the browser's normal HTTP cache. Reuse only
// fetched development JS/CSS in opted-in runs; wallet, API, HTML, RPC and
// record responses always remain live. Vite's version query is part of the
// key, so a changed module is fetched separately.
type CachedModule = { response: APIResponse; headers: Record<string, string> }
const moduleCache = new Map<string, CachedModule>()
const moduleRequests = new Map<string, Promise<CachedModule | null>>()
let moduleRequestContext: Promise<APIRequestContext> | undefined
const staticModule =
  /^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/(?:src\/|node_modules\/|@vite\/|@id\/|@fs\/)/

/** All Sepolia failover reads must see this run's fork, never public Sepolia. */
export async function routeToLocalFork(page: Page) {
  if (process.env.MATRIX_CACHE_APP_MODULES === '1')
    await page.route(staticModule, async (route) => {
      const request = route.request(),
        url = request.url()
      if (
        request.method() !== 'GET' ||
        !['script', 'stylesheet'].includes(request.resourceType())
      )
        return route.fallback()
      if (
        !moduleCache.has(url) &&
        !moduleRequests.has(url) &&
        moduleCache.size + moduleRequests.size >= 1500
      )
        return route.fallback()
      if (!moduleCache.has(url) && !moduleRequests.has(url))
        moduleRequests.set(
          url,
          (async () => {
            moduleRequestContext ??= playwrightRequest.newContext()
            const response = await (await moduleRequestContext).get(url, {
              headers: request.headers(),
              timeout: 120000,
            })
            if (
              response.status() !== 200 ||
              !/javascript|css/.test(response.headers()['content-type'] ?? '')
            ) {
              await response.dispose()
              return null
            }
            const headers = { ...response.headers() }
            delete headers['content-encoding']
            delete headers['content-length']
            // A shared request context keeps the fetched response alive across fresh
            // browser contexts. Fulfilling by response handle avoids retaining a new
            // base64 module body in every Playwright step (even when tracing is off).
            const asset = { response, headers }
            moduleCache.set(url, asset)
            return asset
          })(),
        )
      try {
        const asset = moduleCache.get(url) ?? (await moduleRequests.get(url))
        if (asset) await route.fulfill({ status: 200, ...asset })
        else await route.fallback()
      } catch {
        moduleCache.delete(url)
        await route.fallback().catch(() => {})
      } finally {
        moduleRequests.delete(url)
      }
    })
  await page.route(
    /^https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|sepolia\.gateway\.tenderly\.co|lb\.drpc\.live\/sepolia)(\/|$)/,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST,OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
        return
      }
      const startedAt = Date.now()
      try {
        const response = await route.fetch({
          url: process.env.ANVIL_RPC_URL!,
          timeout: 120000,
        })
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            'access-control-allow-origin': '*',
          },
        })
      } catch (error) {
        // Surface failed RPC as a failed browser request. An unhandled route
        // callback would kill the worker before it can save the blocked evidence.
        console.warn(`[matrix-local-rpc] ${String(error).slice(0, 400)}`)
        await route.abort('failed').catch(() => {})
      } finally {
        if (
          process.env.MATRIX_RPC_TIMING === '1' &&
          Date.now() - startedAt > 1000
        ) {
          const body = route.request().postDataJSON()
          const methods = (Array.isArray(body) ? body : [body]).map(
            (value) => value?.method,
          )
          console.info(
            `[matrix-local-rpc-timing] ${JSON.stringify({ methods, durationMs: Date.now() - startedAt })}`,
          )
        }
      }
    },
  )
}

/** Stop discovery/read routes only after assertions finish, before closing the tab. */
export async function closeFixtureContext(context?: BrowserContext) {
  if (!context) return
  for (const page of context.pages())
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
}
