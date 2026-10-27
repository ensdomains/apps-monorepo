import { useLingui } from '@lingui/react/macro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  buildCommemorativeNftRendererUrl,
  getCommemorativeNftConfig,
} from '../../commemorative-nft/config'
import type { CommemorativeNftEligibility } from '../../commemorative-nft/types'
import { downloadNftVideo, NftVideoDownloadError } from './nftVideoDownload'

type VideoDownloadState =
  | { readonly status: 'idle' }
  | { readonly status: 'preparing' }
  | { readonly status: 'rendering'; readonly progress: number }

export const useNftVideoDownload = (
  eligibility: CommemorativeNftEligibility,
) => {
  const { t } = useLingui()
  const rendererUrl = buildCommemorativeNftRendererUrl({
    eligibility,
    rendererOrigin: getCommemorativeNftConfig().rendererOrigin,
  })
  const request = useRef<AbortController | undefined>(undefined)
  const [state, setState] = useState<VideoDownloadState>({ status: 'idle' })

  useEffect(() => {
    setState({ status: 'idle' })
    if (!rendererUrl) return
    return () => {
      request.current?.abort()
      request.current = undefined
    }
  }, [rendererUrl])

  const cancel = useCallback(() => request.current?.abort(), [])
  const download = useCallback(async () => {
    if (!rendererUrl || request.current) return
    const controller = new AbortController()
    request.current = controller
    setState({ status: 'preparing' })
    try {
      await downloadNftVideo({
        rendererUrl,
        signal: controller.signal,
        onProgress: (progress) => setState({ status: 'rendering', progress }),
      })
      toast.success(t`NFT video downloaded`)
    } catch (error) {
      if (controller.signal.aborted) return
      const reason =
        error instanceof NftVideoDownloadError ? error.reason : 'failed'
      const messages = {
        unsupported: t`Video export is not supported in this browser.`,
        unavailable: t`Video export is unavailable. Please try again later.`,
        failed: t`Video could not be downloaded. Please try again.`,
      }
      toast.error(messages[reason])
    } finally {
      if (request.current === controller) {
        request.current = undefined
        setState({ status: 'idle' })
      }
    }
  }, [rendererUrl, t])

  return { state, download, cancel, available: !!rendererUrl }
}
