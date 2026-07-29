import {
  type Browser,
  chromium,
  type Download,
  type LaunchOptions,
} from 'playwright-core'
import { canonicalizeChromiumMp4 } from './canonicalizeMp4.js'
import { UnsupportedRendererOutputError } from './errors.js'
import { validateH264Mp4, validatePng } from './media.js'
import { verifyRendererRevision } from './rendererRevision.js'
import { parseRenderInput, type RenderInput } from './renderInput.js'

export type CapturedMedia = {
  readonly mp4: Uint8Array
  readonly png: Uint8Array
}

export type MediaCapture = {
  readonly capture: (params: {
    readonly renderInputUrl: string
    readonly renderInput: RenderInput
    readonly tokenId: string
  }) => Promise<CapturedMedia>
}

export type BrowserFactory = () => Promise<Browser>

const downloadBytes = async (download: Download): Promise<Uint8Array> => {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Renderer download did not expose a stream')

  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return new Uint8Array(Buffer.concat(chunks))
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

export const createLocalBrowserFactory = (
  options: Pick<LaunchOptions, 'executablePath'> = {},
): BrowserFactory => {
  return () =>
    chromium.launch({
      executablePath: options.executablePath,
      headless: true,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
      ],
    })
}

export class RendererMediaCapture implements MediaCapture {
  readonly #browserFactory: BrowserFactory
  readonly #captureTimeoutMs: number
  readonly #rendererOrigin: string
  readonly #rendererRevision: string

  constructor(params: {
    readonly browserFactory: BrowserFactory
    readonly captureTimeoutMs: number
    readonly rendererOrigin: string
    readonly rendererRevision: string
  }) {
    this.#browserFactory = params.browserFactory
    this.#captureTimeoutMs = params.captureTimeoutMs
    this.#rendererOrigin = params.rendererOrigin
    this.#rendererRevision = params.rendererRevision
  }

  async capture(params: {
    readonly renderInputUrl: string
    readonly renderInput: RenderInput
    readonly tokenId: string
  }): Promise<CapturedMedia> {
    await verifyRendererRevision({
      rendererOrigin: this.#rendererOrigin,
      rendererRevision: this.#rendererRevision,
    })

    const browser = await this.#browserFactory()
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    page.setDefaultTimeout(this.#captureTimeoutMs)

    try {
      const rendererUrl = new URL(this.#rendererOrigin)
      rendererUrl.searchParams.set('tokenURI', params.renderInputUrl)
      // The staging renderer currently constructs FaceCapture in debug mode.
      rendererUrl.hash = 'debug'

      const renderInputResponse = page.waitForResponse(
        (response) => response.url() === params.renderInputUrl,
      )
      await page.goto(rendererUrl.toString(), { waitUntil: 'networkidle' })
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
      if (JSON.stringify(loadedInput) !== JSON.stringify(params.renderInput)) {
        throw new UnsupportedRendererOutputError(
          'Renderer loaded an unexpected token input',
        )
      }

      await page.waitForFunction(() =>
        Boolean(
          (window as RendererWindow).ens?.faceCapture?.capturePng &&
            (window as RendererWindow).ens?.faceCapture?.exportLoop,
        ),
      )

      const hasWebGl = await page.evaluate(() => {
        const canvas = document.querySelector('canvas')
        return Boolean(
          canvas?.getContext('webgl2') || canvas?.getContext('webgl'),
        )
      })
      if (!hasWebGl) {
        throw new UnsupportedRendererOutputError(
          'Renderer WebGL context is unavailable',
        )
      }

      const pngDownload = page.waitForEvent('download')
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
      const png = await downloadBytes(await pngDownload)
      validatePng(png)

      const mp4Download = page.waitForEvent('download', {
        timeout: this.#captureTimeoutMs,
      })
      await page.evaluate(async () => {
        await (window as RendererWindow).ens?.faceCapture?.exportLoop(30)
      })
      let mp4: Uint8Array
      try {
        mp4 = canonicalizeChromiumMp4(await downloadBytes(await mp4Download))
      } catch (error) {
        throw new UnsupportedRendererOutputError(
          `Renderer MP4 cannot be canonicalized: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      validateH264Mp4(mp4)

      return { png, mp4 }
    } finally {
      await browser.close()
    }
  }
}
