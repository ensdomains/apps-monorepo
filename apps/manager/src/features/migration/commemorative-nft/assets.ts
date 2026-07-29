const ASSET_READINESS_REFETCH_INTERVAL_MS = 5_000
const NOT_READY_RESPONSE_STATUSES = new Set([202, 404, 425, 503])

export class CommemorativeNftAssetRequestError extends Error {
  override readonly name = 'CommemorativeNftAssetRequestError'
}

type SaveBlob = (blob: Blob, filename: string) => void

const saveBlobToFile: SaveBlob = (blob, filename) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = objectUrl
  anchor.style.display = 'none'
  document.documentElement.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

export const downloadCommemorativeNftAsset = async (params: {
  readonly assetUrl: string
  readonly filename: string
  readonly fetcher?: typeof fetch
  readonly saveBlob?: SaveBlob
}): Promise<void> => {
  const response = await (params.fetcher ?? fetch)(params.assetUrl)
  if (!response.ok) {
    throw new CommemorativeNftAssetRequestError(
      `Asset download failed with HTTP ${response.status}`,
    )
  }

  const saveBlob = params.saveBlob ?? saveBlobToFile
  saveBlob(await response.blob(), params.filename)
}

export const startCommemorativeNftAssetDownload = (params: {
  readonly assetUrl: string
  readonly filename: string
  readonly fetcher?: typeof fetch
  readonly saveBlob?: SaveBlob
}): void => {
  void downloadCommemorativeNftAsset(params).catch(() => undefined)
}

export const requestCommemorativeNftAssetPreparation = async (params: {
  readonly prepareUrl: string
  readonly fetcher?: typeof fetch
}): Promise<void> => {
  const response = await (params.fetcher ?? fetch)(params.prepareUrl, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new CommemorativeNftAssetRequestError(
      `Asset preparation request failed with HTTP ${response.status}`,
    )
  }
}

export const startCommemorativeNftAssetPreparation = (params: {
  readonly prepareUrl: string
  readonly fetcher?: typeof fetch
}): void => {
  void requestCommemorativeNftAssetPreparation(params).catch(() => undefined)
}

export const startCommemorativeNftAssetPreparationAfterReceipt =
  async (params: {
    readonly prepareUrl: string
    readonly waitForReceipt: () => Promise<unknown>
    readonly fetcher?: typeof fetch
  }): Promise<void> => {
    await params.waitForReceipt()
    startCommemorativeNftAssetPreparation(params)
  }

export const readCommemorativeNftAssetsReady = async (params: {
  readonly metadataUrl: string
  readonly signal?: AbortSignal
  readonly fetcher?: typeof fetch
}): Promise<boolean> => {
  const response = await (params.fetcher ?? fetch)(params.metadataUrl, {
    cache: 'no-store',
    method: 'HEAD',
    signal: params.signal,
  })

  if (NOT_READY_RESPONSE_STATUSES.has(response.status)) return false
  if (response.ok) return true

  throw new CommemorativeNftAssetRequestError(
    `Asset readiness request failed with HTTP ${response.status}`,
  )
}

export const getCommemorativeNftAssetsReadyRefetchInterval = (params: {
  readonly poll: boolean
  readonly ready: boolean | undefined
}): typeof ASSET_READINESS_REFETCH_INTERVAL_MS | false =>
  params.poll && params.ready !== true
    ? ASSET_READINESS_REFETCH_INTERVAL_MS
    : false
