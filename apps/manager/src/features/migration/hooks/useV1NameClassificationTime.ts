import { useEffect, useState } from 'react'
import type { V1Domain } from '../service/v1SubgraphClient'
import { getNextNameExpiryBoundary } from './useEligibleV1Names.helpers'

const MAX_TIMEOUT_MS = 2_147_483_647
const EMPTY_DOMAINS: readonly V1Domain[] = []

export const useV1NameClassificationTime = (
  domains: readonly V1Domain[] = EMPTY_DOMAINS,
  enabled = true,
): bigint => {
  const [nowSeconds, setNowSeconds] = useState(() =>
    BigInt(Math.floor(Date.now() / 1000)),
  )

  useEffect(() => {
    if (!enabled) return
    let timeout: ReturnType<typeof setTimeout> | undefined

    const refresh = (): void => {
      clearTimeout(timeout)
      const nowMs = Date.now()
      const now = BigInt(Math.floor(nowMs / 1000))
      setNowSeconds(now)
      const nextBoundary = getNextNameExpiryBoundary(domains, now)
      if (nextBoundary === null) return

      // Browser timers overflow beyond ~24 days; wake then to schedule the rest.
      const delayMs = Math.min(
        Number(nextBoundary * 1000n - BigInt(nowMs)),
        MAX_TIMEOUT_MS,
      )
      timeout = setTimeout(refresh, delayMs)
    }

    const refreshWhenVisible = (): void => {
      if (document.visibilityState !== 'hidden') refresh()
    }

    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [domains, enabled])

  return nowSeconds
}
