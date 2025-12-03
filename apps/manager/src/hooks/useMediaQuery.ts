import { useEffect, useState } from 'react'

export const useMediaQuery = (query: string) => {
  // Initialize with the actual media query match if available (browser),
  // or false for SSR/hydration safety
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  })

  useEffect(() => {
    const media = window.matchMedia(query)

    // Set initial value (in case it changed between render and effect)
    setMatches(media.matches)

    // Create event listener function
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    // Add event listener
    media.addEventListener('change', listener)

    // Cleanup function
    return () => {
      media.removeEventListener('change', listener)
    }
  }, [query])

  return matches
}
