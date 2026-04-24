import { useCallback, useState } from 'react'

const STORAGE_KEY = 'ens-portal-do-not-track'

export function useDoNotTrack(): [boolean, (value: boolean) => void] {
  const [doNotTrack, setDoNotTrackState] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )

  const setDoNotTrack = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value))
    setDoNotTrackState(value)
  }, [])

  return [doNotTrack, setDoNotTrack]
}
