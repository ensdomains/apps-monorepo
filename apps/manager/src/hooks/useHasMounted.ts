import { useEffect, useState } from 'react'

/**
 * Returns `false` on the server and during the first client render, then
 * `true` after mount. Use it to gate UI whose output depends on client-only
 * state (e.g. the wagmi connection) so the server-rendered HTML and the first
 * client render agree — avoiding hydration mismatches and content flashes.
 */
export function useHasMounted(): boolean {
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    setHasMounted(true)
  }, [])
  return hasMounted
}
