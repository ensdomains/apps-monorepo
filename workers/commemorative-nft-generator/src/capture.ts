import { chromium, type Download } from 'playwright-core'
import { canonicalizeChromiumMp4 } from './canonicalizeMp4.js'
import type { RenderInput } from './renderInput.js'

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
  readonly close?: () => Promise<void>
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

export class RendererMediaCapture implements MediaCapture {
  readonly #captureTimeoutMs: number
  readonly #chromiumExecutablePath?: string
  readonly #rendererOrigin: string

  constructor(params: {
    readonly captureTimeoutMs: number
    readonly chromiumExecutablePath?: string
    readonly rendererOrigin: string
  }) {
    this.#captureTimeoutMs = params.captureTimeoutMs
    this.#chromiumExecutablePath = params.chromiumExecutablePath
    this.#rendererOrigin = params.rendererOrigin
  }

  async capture(params: {
    readonly renderInputUrl: string
    readonly renderInput: RenderInput
    readonly tokenId: string
  }): Promise<CapturedMedia> {
    const browser = await chromium.launch({
      executablePath: this.#chromiumExecutablePath,
      headless: true,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
      ],
    })
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    page.setDefaultTimeout(this.#captureTimeoutMs)

    try {
      const rendererUrl = new URL(this.#rendererOrigin)
      rendererUrl.searchParams.set('tokenURI', params.renderInputUrl)
      // The renderer currently constructs FaceCapture only in debug mode.
      rendererUrl.hash = 'debug'

      await page.goto(rendererUrl.toString(), { waitUntil: 'networkidle' })
      await page.waitForFunction(() =>
        Boolean(
          (window as RendererWindow).ens?.faceCapture?.capturePng &&
            (window as RendererWindow).ens?.faceCapture?.exportLoop,
        ),
      )

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

      const mp4Download = page.waitForEvent('download', {
        timeout: this.#captureTimeoutMs,
      })
      await page.evaluate(async () => {
        await (window as RendererWindow).ens?.faceCapture?.exportLoop(30)
      })
      const mp4 = canonicalizeChromiumMp4(
        await downloadBytes(await mp4Download),
      )

      if (png.byteLength === 0 || mp4.byteLength === 0) {
        throw new Error('Renderer produced an empty media file')
      }

      return { png, mp4 }
    } finally {
      await browser.close()
    }
  }
}
