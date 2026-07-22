import { useEffect, useState } from 'react'

export const useCommemorativeNftArtwork = (
  persistentArtworkUrl: string | undefined,
): string | undefined => {
  const [devArtworkUrl, setDevArtworkUrl] = useState<string>()

  useEffect(() => {
    setDevArtworkUrl(undefined)
    if (persistentArtworkUrl || !import.meta.env.DEV) return

    let active = true
    import('../components/success/assets/commemorative-nft-art.png').then(
      ({ default: artworkUrl }) => {
        if (active) setDevArtworkUrl(artworkUrl)
      },
    )

    return () => {
      active = false
    }
  }, [persistentArtworkUrl])

  return persistentArtworkUrl ?? devArtworkUrl
}
