import {
  type Browser,
  chromium,
  type Download,
  type LaunchOptions,
  type Response as PlaywrightResponse,
} from 'playwright-core'
import { inspectPageH264 } from './browserReadiness.js'
import { canonicalizeChromiumMp4 } from './canonicalizeMp4.js'
import { UnsupportedRendererOutputError } from './errors.js'
import {
  assertGraphicsRequirement,
  type BrowserFactory,
  chromiumLaunchArguments,
  type GraphicsRequirement,
  inspectPageWebGl,
} from './graphics.js'
import { validateH264Mp4, validatePng } from './media.js'
import { verifyLoadedRendererRevision } from './rendererRevision.js'
import { parseRenderInput, type RenderInput } from './renderInput.js'
import type { ChromiumGraphicsMode } from './runtime.js'

export type CapturedMedia = {
  readonly mp4: Uint8Array
  readonly png: Uint8Array
}

export const BROWSER_CLOSE_TIMEOUT_MS = 10_000
const DOWNLOAD_DELIVERY_TIMEOUT_MS = 10_000

export type MediaCapture = {
  readonly capture: (params: {
    readonly renderInputUrl: string
    readonly renderInput: RenderInput
    readonly tokenId: string
  }) => Promise<CapturedMedia>
}

const downloadBytes = async (download: Download): Promise<Uint8Array> => {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Renderer download did not expose a stream')

  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return new Uint8Array(Buffer.concat(chunks))
}

const waitForDeliveredDownload = async (
  downloadPromise: Promise<Download>,
  mediaType: 'MP4' | 'PNG',
): Promise<Download> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new UnsupportedRendererOutputError(
            `Renderer completed without delivering ${mediaType}`,
          ),
        ),
      DOWNLOAD_DELIVERY_TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([downloadPromise, timeout])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

type RendererWindow = Window & {
  readonly ens?: {
    readonly faceCapture?: {
      readonly capturePng: () => Promise<void>
      readonly exportLoop: (fps: number) => Promise<void>
    }
    readonly time?: {
      captureMode: boolean
      readonly stepCapture: (frame: number) => void
    }
  }
}

const browserEnvironment = (): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      !/(?:ACCESS_KEY|AUTH_TOKEN|CREDENTIAL|PASSWORD|SECRET)/i.test(name)
    ) {
      result[name] = value
    }
  }
  return result
}

export const createLocalBrowserFactory = (
  options: Pick<LaunchOptions, 'executablePath'> & {
    readonly extraArgs?: readonly string[]
    readonly graphicsMode: ChromiumGraphicsMode
  },
): BrowserFactory => {
  return () => {
    const isNvidia = options.graphicsMode === 'ec2-nvidia'
    return chromium.launch({
      channel: options.executablePath ? undefined : 'chromium',
      executablePath: options.executablePath,
      headless: true,
      env: browserEnvironment(),
      args: [
        ...chromiumLaunchArguments(options.graphicsMode),
        ...(options.extraArgs ?? []),
      ],
      ignoreDefaultArgs: isNvidia ? ['--enable-unsafe-swiftshader'] : undefined,
    })
  }
}

export class RendererMediaCapture implements MediaCapture {
  readonly #browserFactory: BrowserFactory
  readonly #captureTimeoutMs: number
  readonly #graphicsRequirement: GraphicsRequirement
  readonly #rendererOrigin: string
  readonly #rendererRevision: string

  constructor(params: {
    readonly browserFactory: BrowserFactory
    readonly captureTimeoutMs: number
    readonly graphicsRequirement: GraphicsRequirement
    readonly rendererOrigin: string
    readonly rendererRevision: string
  }) {
    this.#browserFactory = params.browserFactory
    this.#captureTimeoutMs = params.captureTimeoutMs
    this.#graphicsRequirement = params.graphicsRequirement
    this.#rendererOrigin = params.rendererOrigin
    this.#rendererRevision = params.rendererRevision
  }

  async capture(params: {
    readonly renderInputUrl: string
    readonly renderInput: RenderInput
    readonly tokenId: string
  }): Promise<CapturedMedia> {
    let browser: Browser | undefined
    let browserClosePromise: Promise<void> | undefined
    let timedOut = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const captureTimeoutError = (): Error =>
      new Error(`Renderer capture exceeded ${this.#captureTimeoutMs}ms timeout`)

    const closeBrowser = async (target: Browser | undefined): Promise<void> => {
      if (!target) return
      if (target === browser && browserClosePromise) {
        await browserClosePromise
        return
      }

      const closeAttempt = target.close().catch(() => {
        // Closing is best-effort after a timeout or an already-closed browser.
      })
      let closeTimeout: ReturnType<typeof setTimeout> | undefined
      const closePromise = Promise.race([
        closeAttempt,
        new Promise<void>((resolve) => {
          closeTimeout = setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS)
        }),
      ]).finally(() => {
        if (closeTimeout) clearTimeout(closeTimeout)
      })
      if (target === browser) browserClosePromise = closePromise
      await closePromise
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This keeps the ordered renderer capture protocol in one auditable operation.
    const captureOperation = async (): Promise<CapturedMedia> => {
      browser = await this.#browserFactory()
      if (timedOut) {
        await closeBrowser(browser)
        throw captureTimeoutError()
      }

      try {
        const context = await browser.newContext({ acceptDownloads: true })
        const page = await context.newPage()
        page.setDefaultTimeout(this.#captureTimeoutMs)

        const rendererUrl = new URL(this.#rendererOrigin)
        rendererUrl.searchParams.set('tokenURI', params.renderInputUrl)
        // The staging renderer currently constructs FaceCapture in debug mode.
        rendererUrl.hash = 'debug'

        const scriptResponses: PlaywrightResponse[] = []
        page.on('response', (response) => {
          if (response.request().resourceType() === 'script') {
            scriptResponses.push(response)
          }
        })
        const renderInputResponse = page.waitForResponse(
          (response) => response.url() === params.renderInputUrl,
        )
        const documentResponse = await page.goto(rendererUrl.toString(), {
          waitUntil: 'networkidle',
        })
        if (!documentResponse?.ok()) {
          throw new UnsupportedRendererOutputError(
            `Renderer HTML returned HTTP ${documentResponse?.status() ?? 0}`,
          )
        }
        await verifyLoadedRendererRevision({
          documentHtml: await documentResponse.text(),
          documentUrl: documentResponse.url(),
          rendererRevision: this.#rendererRevision,
          scriptResponses,
        })

        const inputResponse = await renderInputResponse
        if (!inputResponse.ok()) {
          throw new Error(
            `Public render input returned HTTP ${inputResponse.status()}`,
          )
        }
        let loadedInput: RenderInput
        try {
          loadedInput = parseRenderInput(await inputResponse.json())
        } catch (error) {
          throw new UnsupportedRendererOutputError(
            `Renderer loaded an invalid token input: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
        if (
          JSON.stringify(loadedInput) !== JSON.stringify(params.renderInput)
        ) {
          throw new UnsupportedRendererOutputError(
            'Renderer loaded an unexpected token input',
          )
        }

        await page.waitForFunction(() => {
          const rendererError = document.querySelector('[data-error], .error')
          if (rendererError?.textContent?.trim()) return true

          const ens = (window as RendererWindow).ens
          return Boolean(ens?.faceCapture && ens.time)
        })

        const rendererError = await page.evaluate(() => {
          const element = document.querySelector('[data-error], .error')
          return element?.textContent?.trim() || undefined
        })
        if (rendererError) {
          throw new UnsupportedRendererOutputError(
            `Renderer reported an error: ${rendererError}`,
          )
        }

        const encoder = await inspectPageH264(page)
        if (!encoder.ready) {
          throw new UnsupportedRendererOutputError(
            encoder.reason || 'Renderer Chromium cannot encode H.264',
          )
        }

        assertGraphicsRequirement(
          await inspectPageWebGl(page),
          this.#graphicsRequirement,
        )

        const pngDownload = page.waitForEvent('download', {
          timeout: this.#captureTimeoutMs,
        })
        await page.evaluate(async () => {
          const ens = (window as RendererWindow).ens
          if (!ens?.faceCapture || !ens.time) {
            throw new Error('Renderer capture API is unavailable')
          }

          ens.time.captureMode = true
          ens.time.stepCapture(0)
          try {
            await ens.faceCapture.capturePng()
          } finally {
            ens.time.captureMode = false
          }
        })
        const png = await downloadBytes(
          await waitForDeliveredDownload(pngDownload, 'PNG'),
        )
        validatePng(png)

        const mp4Download = page.waitForEvent('download', {
          timeout: this.#captureTimeoutMs,
        })
        await page.evaluate(async () => {
          await (window as RendererWindow).ens?.faceCapture?.exportLoop(30)
        })
        let mp4: Uint8Array
        try {
          mp4 = canonicalizeChromiumMp4(
            await downloadBytes(
              await waitForDeliveredDownload(mp4Download, 'MP4'),
            ),
          )
        } catch (error) {
          throw new UnsupportedRendererOutputError(
            `Renderer MP4 cannot be canonicalized: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
        validateH264Mp4(mp4)

        return { png, mp4 }
      } catch (error) {
        if (timedOut) throw captureTimeoutError()
        throw error
      } finally {
        await closeBrowser(browser)
      }
    }

    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        void closeBrowser(browser).then(() => reject(captureTimeoutError()))
      }, this.#captureTimeoutMs)
    })
    const guardedCaptureOperation = captureOperation().then(
      (media) => {
        if (timedOut) throw captureTimeoutError()
        return media
      },
      (error: unknown) => {
        if (timedOut) throw captureTimeoutError()
        throw error
      },
    )

    try {
      return await Promise.race([guardedCaptureOperation, timeout])
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      await closeBrowser(browser)
    }
  }
}
