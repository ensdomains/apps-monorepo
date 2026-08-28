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
