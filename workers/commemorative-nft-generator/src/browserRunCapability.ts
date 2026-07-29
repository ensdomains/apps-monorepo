import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import {
  type BrowserFactory,
  type CapturedMedia,
  RendererMediaCapture,
} from './capture.js'
import { sha256Hex } from './media.js'
import { parseRenderInput } from './renderInput.js'

export type CapabilityRun = {
  readonly mp4Sha256: string
  readonly pngSha256: string
}

export type BrowserRunCapabilityReport =
  | {
      readonly runs: readonly [CapabilityRun, CapabilityRun]
      readonly selectedAdapter: 'browser-run'
      readonly status: 'passed'
    }
  | {
      readonly reason: string
      readonly selectedAdapter: 'container'
      readonly status: 'failed'
    }

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const captureHashes = (media: CapturedMedia): CapabilityRun => ({
  mp4Sha256: sha256Hex(media.mp4),
  pngSha256: sha256Hex(media.png),
})

export const evaluateCapabilityRuns = (
  first: CapturedMedia,
  second: CapturedMedia,
): BrowserRunCapabilityReport => {
  const runs = [captureHashes(first), captureHashes(second)] as const
  if (
    runs[0].pngSha256 !== runs[1].pngSha256 ||
    runs[0].mp4Sha256 !== runs[1].mp4Sha256
  ) {
    return {
      reason: 'Browser Run outputs were not byte-identical across two runs',
      selectedAdapter: 'container',
      status: 'failed',
    }
  }

  return {
    runs,
    selectedAdapter: 'browser-run',
    status: 'passed',
  }
}

const run = async (): Promise<BrowserRunCapabilityReport> => {
  const deadline = Date.now() + 600_000
  const accountId = required('CLOUDFLARE_ACCOUNT_ID')
  const apiToken = required('CLOUDFLARE_API_TOKEN')
  const renderInputUrl = required('BROWSER_RUN_RENDER_INPUT_URL')
  const tokenId = required('BROWSER_RUN_TOKEN_ID')
  const rendererOrigin =
    process.env.RENDERER_ORIGIN?.trim() || 'https://ens-renderer.pages.dev'
  const rendererRevision = required('RENDERER_REVISION')

  const inputResponse = await fetch(renderInputUrl)
  if (!inputResponse.ok) {
    throw new Error(
      `Render input returned HTTP ${inputResponse.status}: ${renderInputUrl}`,
    )
  }
  const renderInput = parseRenderInput(await inputResponse.json())
  const endpoint = new URL(
    `wss://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser`,
  )
  endpoint.searchParams.set('keep_alive', '600000')
  const params = { renderInput, renderInputUrl, tokenId }
  const captureOnce = async (): Promise<CapturedMedia> => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw new Error('Browser Run capability test exceeded ten minutes')
    }
    const browserFactory: BrowserFactory = () =>
      chromium.connectOverCDP(endpoint.toString(), {
        headers: { Authorization: `Bearer ${apiToken}` },
        timeout: remainingMs,
      })
    return new RendererMediaCapture({
      browserFactory,
      captureTimeoutMs: remainingMs,
      rendererOrigin,
      rendererRevision,
    }).capture(params)
  }

  const first = await captureOnce()
  const second = await captureOnce()
  return evaluateCapabilityRuns(first, second)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  run()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
    })
    .catch((error: unknown) => {
      const report: BrowserRunCapabilityReport = {
        reason: error instanceof Error ? error.message : String(error),
        selectedAdapter: 'container',
        status: 'failed',
      }
      console.log(JSON.stringify(report, null, 2))
    })
}
