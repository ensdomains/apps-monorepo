import { createServer } from 'node:http'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import {
  type BrowserFactory,
  type GraphicsReadinessReport,
  type GraphicsRequirement,
  graphicsReadinessReport,
  inspectPageWebGl,
} from './graphics.js'

const H264_CODEC = 'avc1.640028'
const H264_FRAMERATE = 30
const H264_HEIGHT = 1440
const H264_WIDTH = 1080
const BROWSER_CLOSE_TIMEOUT_MS = 5_000
const DEFAULT_BROWSER_READINESS_TIMEOUT_MS = 30_000

export type H264ReadinessReport = {
  readonly codec: typeof H264_CODEC
  readonly framerate: typeof H264_FRAMERATE
  readonly height: typeof H264_HEIGHT
  readonly quantizerReason?: string
  readonly quantizerSupported: boolean
  readonly ready: boolean
  readonly reason?: string
  readonly width: typeof H264_WIDTH
}

export type BrowserReadinessReport = {
  readonly browserArguments?: readonly string[]
  readonly browserVersion?: string
  readonly encoder: H264ReadinessReport
  readonly graphics: GraphicsReadinessReport
  readonly ready: boolean
  readonly reason?: string
}

type VideoEncoderConstructor = {
  new (init: {
    readonly error: (error: unknown) => void
    readonly output: (chunk: { readonly byteLength: number }) => void
  }): VideoEncoderInstance
}

type VideoEncoderInstance = {
  readonly close: () => void
  readonly configure: (config: Readonly<Record<string, unknown>>) => void
  readonly encode: (
    frame: unknown,
    options: Readonly<Record<string, unknown>>,
  ) => void
  readonly flush: () => Promise<void>
}

type VideoFrameConstructor = new (
  source: HTMLCanvasElement,
  init: { readonly duration: number; readonly timestamp: number },
) => { readonly close: () => void }

const unavailableEncoderReport = (reason: string): H264ReadinessReport => ({
  codec: H264_CODEC,
  framerate: H264_FRAMERATE,
  height: H264_HEIGHT,
  quantizerSupported: false,
  ready: false,
  reason,
  width: H264_WIDTH,
})

export const inspectPageH264 = async (
  page: Page,
): Promise<H264ReadinessReport> => {
  return (await page.evaluate(
    async ({ codec, framerate, height, width }) => {
      const VideoEncoderApi = (
        globalThis as unknown as {
          readonly VideoEncoder?: VideoEncoderConstructor
        }
      ).VideoEncoder
      const VideoFrameApi = (
        globalThis as unknown as {
          readonly VideoFrame?: VideoFrameConstructor
        }
      ).VideoFrame
      if (!VideoEncoderApi || !VideoFrameApi) {
        return {
          codec,
          framerate,
          height,
          quantizerSupported: false,
          ready: false,
          reason:
            'VideoEncoder or VideoFrame is unavailable in this Chromium build',
          width,
        }
      }
      const Encoder = VideoEncoderApi
      const Frame = VideoFrameApi

      const baseConfig = {
        avc: { format: 'avc' },
        codec,
        framerate,
        height,
        width,
      } as const

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        return {
          codec,
          framerate,
          height,
          quantizerSupported: false,
          ready: false,
          reason: 'Could not create an encoder probe canvas',
          width,
        }
      }
      context.fillStyle = '#000'
      context.fillRect(0, 0, width, height)

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The complete encoder probe must stay inside the serialized browser callback.
      async function tryEncode(
        config: Readonly<Record<string, unknown>>,
        options: Readonly<Record<string, unknown>>,
      ): Promise<{
        readonly reason?: string
        readonly supported: boolean
      }> {
        let encoder: VideoEncoderInstance | undefined
        try {
          let encoderError: string | undefined
          let outputBytes = 0
          const currentEncoder = new Encoder({
            error: (error) => {
              encoderError =
                error instanceof Error ? error.message : String(error)
            },
            output: (chunk) => {
              outputBytes += chunk.byteLength
            },
          })
          encoder = currentEncoder
          currentEncoder.configure(config)
          const frame = new Frame(canvas, {
            duration: 1_000_000 / framerate,
            timestamp: 0,
          })
          try {
            currentEncoder.encode(frame, options)
          } finally {
            frame.close()
          }
          await currentEncoder.flush()

          const reason =
            encoderError ||
            (outputBytes === 0 ? 'H.264 encoder produced no output' : undefined)
          return reason ? { reason, supported: false } : { supported: true }
        } catch (error) {
          return {
            reason: error instanceof Error ? error.message : String(error),
            supported: false,
          }
        } finally {
          try {
            encoder?.close()
          } catch {
            // The browser closes an encoder automatically after some failures.
          }
        }
      }

      const bitrateProbe = await tryEncode(
        {
          ...baseConfig,
          bitrate: 6_000_000,
        },
        { keyFrame: true },
      )
      const ready = bitrateProbe.supported
      const reason = ready
        ? undefined
        : bitrateProbe.reason ||
          'H.264 VideoEncoder configuration is unsupported'

      const quantizerProbe = await tryEncode(
        {
          ...baseConfig,
          bitrateMode: 'quantizer',
        },
        { avc: { quantizer: 20 }, keyFrame: true },
      )
      const quantizerSupported = quantizerProbe.supported
      const quantizerReason = quantizerSupported
        ? undefined
        : quantizerProbe.reason || 'H.264 quantizer mode is unsupported'

      return {
        codec,
        framerate,
        height,
        ...(quantizerReason ? { quantizerReason } : {}),
        quantizerSupported,
        ready,
        ...(reason ? { reason } : {}),
        width,
      }
    },
    {
      codec: H264_CODEC,
      framerate: H264_FRAMERATE,
      height: H264_HEIGHT,
      width: H264_WIDTH,
    },
  )) as H264ReadinessReport
}

const openLoopbackPage = async <T>(
  browser: Browser,
  inspect: (page: Page) => Promise<T>,
): Promise<T> => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><meta charset="utf-8"><title>probe</title>')
  })

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => reject(error)
    server.once('error', handleError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', handleError)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not bind the Chromium readiness probe')
  }

  let context: BrowserContext | undefined
  try {
    context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/`, {
      waitUntil: 'domcontentloaded',
    })
    return await inspect(page)
  } finally {
    await context?.close().catch(() => {
      // A timed-out probe may already have closed the browser.
    })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

export const probeBrowserReadiness = async (params: {
  readonly browserFactory: BrowserFactory
  readonly configuredMode: GraphicsRequirement
  readonly timeoutMs?: number
}): Promise<BrowserReadinessReport> => {
  let browser: Browser | undefined
  let browserClosePromise: Promise<void> | undefined
  let timedOut = false
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutMs = params.timeoutMs ?? DEFAULT_BROWSER_READINESS_TIMEOUT_MS
  const timeoutError = (): Error =>
    new Error(`Chromium readiness probe exceeded ${timeoutMs}ms timeout`)

  const closeBrowser = async (): Promise<void> => {
    if (!browser) return
    let closeTimeout: ReturnType<typeof setTimeout> | undefined
    browserClosePromise ??= Promise.race([
      browser.close().catch(() => {
        // Closing is best-effort after a failed or timed-out probe.
      }),
      new Promise<void>((resolve) => {
        closeTimeout = setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (closeTimeout) clearTimeout(closeTimeout)
    })
    await browserClosePromise
  }

  try {
    const probe = (async (): Promise<BrowserReadinessReport> => {
      browser = await params.browserFactory()
      if (timedOut) {
        await closeBrowser()
        throw timeoutError()
      }

      const browserVersion = browser.version()
      let browserArguments: readonly string[] | undefined
      try {
        const session = await browser.newBrowserCDPSession()
        try {
          const result = await session.send('Browser.getBrowserCommandLine')
          browserArguments = result.arguments
        } finally {
          await session.detach()
        }
      } catch {
        // Command-line evidence is best-effort; capability probes remain authoritative.
      }

      return await openLoopbackPage(browser, async (page) => {
        const graphics = graphicsReadinessReport(
          await inspectPageWebGl(page),
          params.configuredMode,
        )
        const encoder = await inspectPageH264(page)
        const ready = graphics.ready && encoder.ready
        const reason = !graphics.ready
          ? graphics.reason
          : !encoder.ready
            ? encoder.reason
            : undefined

        return {
          ...(browserArguments ? { browserArguments } : {}),
          browserVersion,
          encoder,
          graphics,
          ready,
          ...(reason ? { reason } : {}),
        }
      })
    })()
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        void closeBrowser()
        reject(timeoutError())
      }, timeoutMs)
    })
    return await Promise.race([probe, timeout])
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      encoder: unavailableEncoderReport(reason),
      graphics: {
        backend: 'unavailable',
        configuredMode: params.configuredMode,
        gpuBacked: false,
        ready: false,
        reason,
      },
      ready: false,
      reason,
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    await closeBrowser()
  }
}

export const createCachedBrowserReadinessProbe = (params: {
  readonly browserFactory: BrowserFactory
  readonly cacheMs?: number
  readonly configuredMode: GraphicsRequirement
  readonly now?: () => number
  readonly timeoutMs?: number
}): (() => Promise<BrowserReadinessReport>) => {
  const cacheMs = params.cacheMs ?? 60_000
  const now = params.now ?? Date.now
  let cached:
    | { readonly expiresAt: number; readonly report: BrowserReadinessReport }
    | undefined
  let pending: Promise<BrowserReadinessReport> | undefined

  return async () => {
    const currentTime = now()
    if (cached && cached.expiresAt > currentTime) return cached.report
    if (pending) return pending

    pending = probeBrowserReadiness(params).then((report) => {
      const reportCacheMs = report.ready ? cacheMs : Math.min(cacheMs, 15_000)
      cached = { expiresAt: now() + reportCacheMs, report }
      return report
    })
    try {
      return await pending
    } finally {
      pending = undefined
    }
  }
}
