import { withRequestDeadline } from '../service/requestDeadline'
import { trackNftEvent } from './diagnostics'

class CommemorativeNftAssetRequestError extends Error {
  override readonly name = 'CommemorativeNftAssetRequestError'
}

type SaveBlob = (blob: Blob, filename: string) => void

const downloadFailureReason = (error: unknown) => {
  if (error instanceof CommemorativeNftAssetRequestError) return 'http'
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'timeout'
  if (error instanceof DOMException && error.name === 'AbortError')
    return 'aborted'
  return error instanceof TypeError ? 'network' : 'unknown'
}

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

export const downloadCommemorativeNftImage = async (params: {
  readonly assetUrl: string
  readonly filename: string
  readonly fetcher?: typeof fetch
  readonly saveBlob?: SaveBlob
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}): Promise<void> => {
  try {
    const blob = await withRequestDeadline(
      async (signal) => {
        const response = await (params.fetcher ?? fetch)(params.assetUrl, {
          signal,
        })
        if (!response.ok) {
          throw new CommemorativeNftAssetRequestError(
            `Asset download failed with HTTP ${response.status}`,
          )
        }
        return response.blob()
      },
      { signal: params.signal, timeoutMs: params.timeoutMs },
    )
    params.signal?.throwIfAborted()
    const saveBlob = params.saveBlob ?? saveBlobToFile
    saveBlob(blob, params.filename)
  } catch (error) {
    trackNftEvent('nft:download_failure', {
      reason: downloadFailureReason(error),
    })
    throw error
  }
}
