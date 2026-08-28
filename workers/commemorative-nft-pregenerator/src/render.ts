import { Buffer } from 'node:buffer'
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Download,
  type Page,
} from 'playwright'
import { sha256Hex, validatePng } from './media.js'
import {
  findRendererBundleUrl,
  loadVerifiedRendererBundle,
  RendererRevisionError,
  type VerifiedRendererBundle,
} from './rendererRevision.js'
import { withRetry } from './retry.js'

export class RendererClosedError extends Error {
  override readonly name = 'RendererClosedError'
}

export class RendererCaptureTimeoutError extends Error {
  override readonly name = 'RendererCaptureTimeoutError'
}

export class RendererTextAssetsNotReadyError extends Error {
  override readonly name = 'RendererTextAssetsNotReadyError'
}

export type RenderPngJob = {
  readonly tokenId: string
  readonly tokenUri: unknown
}

export type RenderedPng = {
  readonly bundleUrl: string
  readonly png: Uint8Array
  readonly rendererRevision: string
  readonly sha256: string
  readonly tokenId: string
}

export type PngRenderer = {
  readonly close: () => Promise<void>
  readonly render: (job: RenderPngJob) => Promise<RenderedPng>
}

export type PngRendererConfig = {
  readonly captureAttempts?: number
  readonly captureTimeoutMs?: number
  readonly chromiumArgs?: readonly string[]
  readonly concurrency: number
  readonly executablePath?: string
  readonly rendererLoadAttempts?: number
  readonly rendererOrigin: string
  readonly rendererRevision: string
  readonly retryBaseDelayMs?: number
}

type RendererWindow = Window & {
  readonly ens?: {
    readonly captureReady?: Promise<void>
    readonly faceCapture?: {
      readonly capturePng: (options: {
        readonly includeText: true
      }) => Promise<void>
    }
    readonly time?: {
      captureMode: boolean
      readonly stepCapture: (frame: number) => void
    }
    readonly world?: {
      readonly card?: {
        readonly cardText?: {
          readonly _ensMarkImg?: HTMLImageElement | null
          readonly _fontsLoaded?: boolean
        }
      }
    }
  }
}

type PageWorker = {
  blockedAssetUrls: Set<string>
  busy: boolean
  context: BrowserContext
  readonly id: number
  page: Page
}

type PendingRender = {
  readonly job: RenderPngJob
  readonly reject: (reason?: unknown) => void
  readonly resolve: (value: RenderedPng) => void
}

const DEFAULT_CAPTURE_ATTEMPTS = 3
const DEFAULT_CAPTURE_TIMEOUT_MS = 45_000
const DEFAULT_RENDERER_LOAD_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 500

const positiveInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

const nonNegativeInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

const rendererUrl = (origin: string, tokenUri: unknown): string => {
  const serializedTokenUri = JSON.stringify(tokenUri)
  if (serializedTokenUri === undefined) {
    throw new Error('Renderer token URI must be JSON serializable')
  }

  const url = new URL(origin)
  url.searchParams.set(
    'tokenURI',
    `data:application/json,${encodeURIComponent(serializedTokenUri)}`,
  )
  url.hash = 'debug'
  return url.toString()
}

const rendererErrorText = (): string | undefined => {
  const element = document.querySelector('[data-error], .error')
  return element?.textContent?.trim() || undefined
}

const isRendererReady = (): boolean => {
  const element = document.querySelector('[data-error], .error')
  if (element?.textContent?.trim()) return true

  const ens = (window as RendererWindow).ens
  return Boolean(ens?.faceCapture && ens.time)
}

type RendererTextAssetStatus = {
  readonly boldFontLoaded: boolean
  readonly cardTextAvailable: boolean
  readonly documentFontsLoaded: boolean
  readonly internalFontsLoaded: boolean
  readonly logoLoaded: boolean
  readonly regularFontLoaded: boolean
}

const rendererTextAssetStatus = (): RendererTextAssetStatus => {
  const cardText = (window as RendererWindow).ens?.world?.card?.cardText
  const logo = cardText?._ensMarkImg
  return {
    boldFontLoaded:
      document.fonts?.check('700 16px "ABCMonumentGrotesk"') ?? false,
    cardTextAvailable: Boolean(cardText),
    documentFontsLoaded: document.fonts?.status === 'loaded',
    internalFontsLoaded: cardText?._fontsLoaded === true,
    logoLoaded: Boolean(
      logo?.complete && logo.naturalWidth > 0 && logo.naturalHeight > 0,
    ),
    regularFontLoaded:
      document.fonts?.check('400 16px "ABCMonumentGrotesk"') ?? false,
  }
}

const rendererTextAssetsReady = (): boolean => {
  const cardText = (window as RendererWindow).ens?.world?.card?.cardText
  const logo = cardText?._ensMarkImg
  return Boolean(
    cardText &&
      cardText._fontsLoaded === true &&
      document.fonts?.status === 'loaded' &&
      document.fonts.check('400 16px "ABCMonumentGrotesk"') &&
      document.fonts.check('700 16px "ABCMonumentGrotesk"') &&
      logo?.complete &&
      logo.naturalWidth > 0 &&
      logo.naturalHeight > 0,
  )
}

const waitForRendererTextAssets = async (page: Page): Promise<void> => {
  try {
    await page.evaluate(async () => {
      const captureReady = (window as RendererWindow).ens?.captureReady
      if (!captureReady) {
        throw new Error('Renderer captureReady promise is unavailable')
      }
      await captureReady
    })
    await page.waitForFunction(rendererTextAssetsReady)
  } catch (cause) {
    const status = await page
      .evaluate(rendererTextAssetStatus)
      .catch(() => undefined)
    throw new RendererTextAssetsNotReadyError(
      `Renderer text assets did not become ready${status ? `: ${JSON.stringify(status)}` : ''}`,
      { cause },
    )
  }
}

const assertNoBlockedRendererAssets = (worker: PageWorker): void => {
  if (worker.blockedAssetUrls.size === 0) return

  throw new RendererRevisionError(
    `Renderer requested unpinned assets: ${[...worker.blockedAssetUrls]
      .sort((left, right) => left.localeCompare(right, 'en-US'))
      .join(', ')}`,
  )
}

const downloadBytes = async (download: Download): Promise<Uint8Array> => {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Renderer download did not expose a stream')

  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Uint8Array.from(Buffer.concat(chunks))
}

const withCaptureTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new RendererCaptureTimeoutError(
            `Renderer capture exceeded ${timeoutMs}ms`,
          ),
        ),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

class PlaywrightPngRenderer implements PngRenderer {
  readonly #activeTasks = new Set<Promise<void>>()
  readonly #browser: Browser
  readonly #bundle: VerifiedRendererBundle
  readonly #captureAttempts: number
  readonly #captureTimeoutMs: number
  #closePromise?: Promise<void>
  #closed = false
  readonly #pending: PendingRender[] = []
  readonly #rendererOrigin: string
  readonly #rendererRevision: string
  readonly #retryBaseDelayMs: number
  readonly #workers: PageWorker[] = []

  private constructor(params: {
    readonly browser: Browser
    readonly bundle: VerifiedRendererBundle
    readonly captureAttempts: number
    readonly captureTimeoutMs: number
    readonly rendererOrigin: string
    readonly rendererRevision: string
    readonly retryBaseDelayMs: number
  }) {
    this.#browser = params.browser
    this.#bundle = params.bundle
    this.#captureAttempts = params.captureAttempts
    this.#captureTimeoutMs = params.captureTimeoutMs
    this.#rendererOrigin = params.rendererOrigin
    this.#rendererRevision = params.rendererRevision
    this.#retryBaseDelayMs = params.retryBaseDelayMs
  }

  static async create(params: {
    readonly browser: Browser
    readonly bundle: VerifiedRendererBundle
    readonly captureAttempts: number
    readonly captureTimeoutMs: number
    readonly concurrency: number
    readonly rendererOrigin: string
    readonly rendererRevision: string
    readonly retryBaseDelayMs: number
  }): Promise<PlaywrightPngRenderer> {
    const renderer = new PlaywrightPngRenderer(params)
    try {
      for (let index = 0; index < params.concurrency; index += 1) {
        renderer.#workers.push(await renderer.#createWorker(index))
      }
      return renderer
    } catch (error) {
      await renderer.close()
      throw error
    }
  }

  async #createWorker(id: number): Promise<PageWorker> {
    const context = await this.#browser.newContext({ acceptDownloads: true })
    try {
      const verifiedDocumentUrl = new URL(this.#bundle.documentUrl)
      const assetsByUrl = new Map(
        this.#bundle.assets.map((asset) => [asset.url, asset]),
      )
      const blockedAssetUrls = new Set<string>()
      await context.route('**/*', async (route) => {
        const request = route.request()
        const requestUrl = new URL(request.url())
        if (
          requestUrl.protocol !== 'http:' &&
          requestUrl.protocol !== 'https:'
        ) {
          await route.continue()
          return
        }

        requestUrl.hash = ''
        const isDocument =
          request.resourceType() === 'document' &&
          requestUrl.origin === verifiedDocumentUrl.origin &&
          requestUrl.pathname === verifiedDocumentUrl.pathname
        if (isDocument) {
          await route.fulfill({
            body: this.#bundle.documentHtml,
            contentType: this.#bundle.documentContentType,
          })
          return
        }

        const asset = assetsByUrl.get(requestUrl.toString())
        if (asset) {
          await route.fulfill({
            body: Buffer.from(asset.body),
            contentType: asset.contentType,
            headers: { 'access-control-allow-origin': '*' },
          })
          return
        }

        blockedAssetUrls.add(requestUrl.toString())
        await route.abort('blockedbyclient')
      })
      const page = await context.newPage()
      page.setDefaultNavigationTimeout(this.#captureTimeoutMs)
      page.setDefaultTimeout(this.#captureTimeoutMs)
      return { blockedAssetUrls, busy: false, context, id, page }
    } catch (error) {
      await context.close().catch(() => undefined)
      throw error
    }
  }

  async #resetWorker(worker: PageWorker): Promise<void> {
    await worker.context.close().catch(() => undefined)
    if (this.#closed) return

    const replacement = await this.#createWorker(worker.id)
    worker.blockedAssetUrls = replacement.blockedAssetUrls
    worker.context = replacement.context
    worker.page = replacement.page
  }

  async #capture(worker: PageWorker, job: RenderPngJob): Promise<RenderedPng> {
    const page = worker.page
    worker.blockedAssetUrls.clear()
    const documentResponse = await page.goto(
      rendererUrl(this.#rendererOrigin, job.tokenUri),
      { waitUntil: 'domcontentloaded' },
    )
    if (!documentResponse?.ok()) {
      throw new Error(
        `Renderer HTML returned HTTP ${documentResponse?.status() ?? 0}`,
      )
    }

    await page.waitForFunction(isRendererReady)
    assertNoBlockedRendererAssets(worker)

    const reportedError = await page.evaluate(rendererErrorText)
    if (reportedError) {
      throw new Error(`Renderer reported an error: ${reportedError}`)
    }

    const documentHtml = await documentResponse.text()
    const observedBundleUrl = findRendererBundleUrl(
      documentResponse.url(),
      documentHtml,
    )
    if (observedBundleUrl !== this.#bundle.url) {
      throw new RendererRevisionError(
        `Renderer entry bundle changed from ${this.#bundle.url} to ${observedBundleUrl}`,
      )
    }

    await waitForRendererTextAssets(page)
    assertNoBlockedRendererAssets(worker)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(async () => {
        const ens = (window as RendererWindow).ens
        if (!ens?.faceCapture || !ens.time) {
          throw new Error('Renderer capture API is unavailable')
        }

        ens.time.captureMode = true
        ens.time.stepCapture(0)
        try {
          await ens.faceCapture.capturePng({ includeText: true })
        } finally {
          ens.time.captureMode = false
        }
      }),
    ])
    assertNoBlockedRendererAssets(worker)
    const png = await downloadBytes(download)
    validatePng(png)

    return {
      bundleUrl: this.#bundle.url,
      png,
      rendererRevision: this.#rendererRevision,
      sha256: sha256Hex(png),
      tokenId: job.tokenId,
    }
  }

  async #renderWithRetry(
    worker: PageWorker,
    job: RenderPngJob,
  ): Promise<RenderedPng> {
    return withRetry(
      async () => {
        try {
          return await withCaptureTimeout(
            this.#capture(worker, job),
            this.#captureTimeoutMs,
          )
        } catch (error) {
          try {
            await this.#resetWorker(worker)
          } catch (resetError) {
            throw new AggregateError(
              [error, resetError],
              `Renderer worker ${worker.id} failed and could not be recreated`,
            )
          }
          throw error
        }
      },
      {
        attempts: this.#captureAttempts,
        baseDelayMs: this.#retryBaseDelayMs,
        isRetryable: () => !this.#closed,
      },
    )
  }

  #dispatch(): void {
    if (this.#closed) return

    for (const worker of this.#workers) {
      if (worker.busy) continue
      const pending = this.#pending.shift()
      if (!pending) return

      worker.busy = true
      let task: Promise<void>
      task = this.#renderWithRetry(worker, pending.job)
        .then(pending.resolve, pending.reject)
        .finally(() => {
          worker.busy = false
          this.#activeTasks.delete(task)
          this.#dispatch()
        })
      this.#activeTasks.add(task)
    }
  }

  render(job: RenderPngJob): Promise<RenderedPng> {
    if (this.#closed) {
      return Promise.reject(new RendererClosedError('Renderer is closed'))
    }
    if (job.tokenId.length === 0) {
      return Promise.reject(new Error('Renderer token ID cannot be empty'))
    }

    return new Promise((resolve, reject) => {
      this.#pending.push({ job, reject, resolve })
      this.#dispatch()
    })
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise
    this.#closed = true

    const closeError = new RendererClosedError(
      'Renderer closed before the queued job started',
    )
    for (const pending of this.#pending.splice(0)) pending.reject(closeError)

    this.#closePromise = (async () => {
      await Promise.allSettled([...this.#activeTasks])
      await Promise.allSettled(
        this.#workers.map((worker) => worker.context.close()),
      )
      await this.#browser.close()
    })()
    return this.#closePromise
  }
}

export const createPngRenderer = async (
  config: PngRendererConfig,
): Promise<PngRenderer> => {
  const concurrency = positiveInteger(
    config.concurrency,
    'Renderer concurrency',
  )
  const captureAttempts = positiveInteger(
    config.captureAttempts ?? DEFAULT_CAPTURE_ATTEMPTS,
    'Renderer capture attempts',
  )
  const captureTimeoutMs = positiveInteger(
    config.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS,
    'Renderer capture timeout',
  )
  const rendererLoadAttempts = positiveInteger(
    config.rendererLoadAttempts ?? DEFAULT_RENDERER_LOAD_ATTEMPTS,
    'Renderer load attempts',
  )
  const retryBaseDelayMs = nonNegativeInteger(
    config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    'Renderer retry base delay',
  )
  const rendererOrigin = new URL(config.rendererOrigin).toString()

  const bundle = await withRetry(
    () =>
      loadVerifiedRendererBundle({
        rendererOrigin,
        rendererRevision: config.rendererRevision,
      }),
    {
      attempts: rendererLoadAttempts,
      baseDelayMs: retryBaseDelayMs,
      isRetryable: (error) =>
        !(error instanceof RendererRevisionError) || error.isTransient,
    },
  )

  const browser = await chromium.launch({
    args: [...(config.chromiumArgs ?? [])],
    executablePath: config.executablePath,
    headless: true,
  })
  return PlaywrightPngRenderer.create({
    browser,
    bundle,
    captureAttempts,
    captureTimeoutMs,
    concurrency,
    rendererOrigin,
    rendererRevision: config.rendererRevision,
    retryBaseDelayMs,
  })
}
