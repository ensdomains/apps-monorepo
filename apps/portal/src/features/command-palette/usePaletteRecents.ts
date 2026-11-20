import { Result } from 'neverthrow'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import {
  getRecentEntities,
  parseRecentEntities,
  RECENTS_STORAGE_KEY,
  recordRecentEntity,
  serializeRecentEntities,
} from './core/recents'
import type { PaletteEntity } from './core/types'

const readRecents = () => {
  const result = Result.fromThrowable(() =>
    localStorage.getItem(RECENTS_STORAGE_KEY),
  )()
  return parseRecentEntities(result.isOk() ? result.value : null)
}

export const usePaletteRecents = ({
  entity,
  chainId,
  walletAddress,
}: {
  readonly entity?: PaletteEntity
  readonly chainId: number
  readonly walletAddress?: Address
}) => {
  const [entries, setEntries] = useState(readRecents)
  useEffect(() => {
    if (!entity) return
    const now = Date.now()
    setEntries((previous) =>
      recordRecentEntity({ entries: previous, entity, chainId, now }),
    )
  }, [entity, chainId])
  useEffect(() => {
    Result.fromThrowable(() =>
      localStorage.setItem(
        RECENTS_STORAGE_KEY,
        serializeRecentEntities(entries),
      ),
    )()
  }, [entries])
  const recentEntities = getRecentEntities({
    entries,
    chainId,
    walletAddress,
    now: Date.now(),
    exclude: entity,
    limit: 3,
  })
  return { recentEntities, clearRecents: () => setEntries([]) }
}
