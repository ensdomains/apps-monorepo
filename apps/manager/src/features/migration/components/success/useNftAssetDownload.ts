import { useLingui } from '@lingui/react/macro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { downloadCommemorativeNftImage } from '../../commemorative-nft/assets'

export const useNftAssetDownload = (assetUrl: string | undefined) => {
  const { t } = useLingui()
  const request = useRef<AbortController | undefined>(undefined)
  const [state, setState] = useState({ assetUrl, pending: false })
  const pending = state.assetUrl === assetUrl && state.pending

  useEffect(() => {
    setState({ assetUrl, pending: false })
    return () => {
      request.current?.abort()
      request.current = undefined
    }
  }, [assetUrl])

  const download = useCallback(async () => {
    if (!assetUrl || request.current) return
    const controller = new AbortController()
    request.current = controller
    setState({ assetUrl, pending: true })
    try {
      await downloadCommemorativeNftImage({
        assetUrl,
        filename: 'ensv2-commemorative-nft.webp',
        signal: controller.signal,
      })
      if (!controller.signal.aborted) toast.success(t`NFT artwork downloaded`)
    } catch {
      if (!controller.signal.aborted)
        toast.error(t`Artwork could not be downloaded. Please try again.`)
    } finally {
      if (request.current === controller) {
        request.current = undefined
        setState({ assetUrl, pending: false })
      }
    }
  }, [assetUrl, t])

  return { download, pending }
}
