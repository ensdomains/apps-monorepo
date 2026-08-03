import type { Browser, Page } from 'playwright-core'
import { GraphicsRequirementError } from './errors.js'
import type { ChromiumGraphicsMode } from './runtime.js'

export type BrowserFactory = () => Promise<Browser>

export type GraphicsRequirement = ChromiumGraphicsMode | 'browser-run'

export type WebGlBackend = 'nvidia' | 'software' | 'unknown' | 'unavailable'

export type WebGlRendererInfo = {
  readonly backend: WebGlBackend
  readonly gpuBacked: boolean
  readonly renderer?: string
  readonly vendor?: string
}

export type GraphicsReadinessReport = WebGlRendererInfo & {
  readonly configuredMode: GraphicsRequirement
  readonly ready: boolean
  readonly reason?: string
}

type RawWebGlRendererInfo = {
  readonly available: boolean
  readonly maskedRenderer?: string
  readonly maskedVendor?: string
  readonly unmaskedRenderer?: string
  readonly unmaskedVendor?: string
}

const SOFTWARE_RENDERER_MARKERS = [
  'lavapipe',
  'llvmpipe',
  'microsoft basic render',
  'osmesa',
  'softpipe',
  'software rasterizer',
  'swiftshader',
] as const

export const chromiumLaunchArguments = (
  mode: ChromiumGraphicsMode,
): readonly string[] => {
  if (mode === 'software') {
    return [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
    ]
  }

  return [
    '--enable-gpu',
    '--enable-gpu-rasterization',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-software-rasterizer',
  ]
}

export const classifyWebGlRenderer = (
  raw: RawWebGlRendererInfo,
): WebGlRendererInfo => {
  if (!raw.available) {
    return { backend: 'unavailable', gpuBacked: false }
  }

  const vendor = raw.unmaskedVendor || raw.maskedVendor
  const renderer = raw.unmaskedRenderer || raw.maskedRenderer
  const description = [
    raw.maskedRenderer,
    raw.maskedVendor,
    raw.unmaskedRenderer,
    raw.unmaskedVendor,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    SOFTWARE_RENDERER_MARKERS.some((marker) => description.includes(marker))
  ) {
    return { backend: 'software', gpuBacked: false, renderer, vendor }
  }
  if (description.includes('nvidia')) {
    return { backend: 'nvidia', gpuBacked: true, renderer, vendor }
  }

  return { backend: 'unknown', gpuBacked: false, renderer, vendor }
}

export const isGraphicsRequirementMet = (
  info: WebGlRendererInfo,
  requirement: GraphicsRequirement,
): boolean => {
  if (requirement === 'ec2-nvidia') {
    return info.backend === 'nvidia' && info.gpuBacked
  }
  return info.backend !== 'unavailable'
}

export const graphicsReadinessReport = (
  info: WebGlRendererInfo,
  configuredMode: GraphicsRequirement,
): GraphicsReadinessReport => {
  const ready = isGraphicsRequirementMet(info, configuredMode)
  if (ready) return { ...info, configuredMode, ready }

  const reason =
    configuredMode === 'ec2-nvidia'
      ? `Expected NVIDIA-backed WebGL, detected ${info.backend}`
      : 'Chromium WebGL is unavailable'
  return { ...info, configuredMode, ready, reason }
}

export const assertGraphicsRequirement = (
  info: WebGlRendererInfo,
  requirement: GraphicsRequirement,
): void => {
  const report = graphicsReadinessReport(info, requirement)
  if (!report.ready) {
    throw new GraphicsRequirementError(report.reason)
  }
}

export const inspectPageWebGl = async (
  page: Page,
): Promise<WebGlRendererInfo> => {
  const raw = await page.evaluate((): RawWebGlRendererInfo => {
    const canvas =
      document.querySelector('canvas') ?? document.createElement('canvas')
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!context) return { available: false }

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
    const stringParameter = (parameter: number): string | undefined => {
      const value: unknown = context.getParameter(parameter)
      return typeof value === 'string' ? value : undefined
    }

    return {
      available: true,
      maskedRenderer: stringParameter(context.RENDERER),
      maskedVendor: stringParameter(context.VENDOR),
      unmaskedRenderer: debugInfo
        ? stringParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : undefined,
      unmaskedVendor: debugInfo
        ? stringParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : undefined,
    }
  })

  return classifyWebGlRenderer(raw)
}

export const probeBrowserGraphics = async (params: {
  readonly browserFactory: BrowserFactory
  readonly configuredMode: GraphicsRequirement
}): Promise<GraphicsReadinessReport> => {
  let browser: Browser | undefined
  try {
    browser = await params.browserFactory()
    const context = await browser.newContext()
    const page = await context.newPage()
    return graphicsReadinessReport(
      await inspectPageWebGl(page),
      params.configuredMode,
    )
  } catch (error) {
    return {
      backend: 'unavailable',
      configuredMode: params.configuredMode,
      gpuBacked: false,
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await browser?.close()
  }
}

export const createCachedGraphicsProbe = (params: {
  readonly browserFactory: BrowserFactory
  readonly cacheMs?: number
  readonly configuredMode: GraphicsRequirement
  readonly now?: () => number
}): (() => Promise<GraphicsReadinessReport>) => {
  const cacheMs = params.cacheMs ?? 60_000
  const now = params.now ?? Date.now
  let cached:
    | { readonly expiresAt: number; readonly report: GraphicsReadinessReport }
    | undefined
  let pending: Promise<GraphicsReadinessReport> | undefined

  return async () => {
    const currentTime = now()
    if (cached && cached.expiresAt > currentTime) return cached.report
    if (pending) return pending

    pending = probeBrowserGraphics(params).then((report) => {
      cached = { expiresAt: now() + cacheMs, report }
      return report
    })
    try {
      return await pending
    } finally {
      pending = undefined
    }
  }
}
