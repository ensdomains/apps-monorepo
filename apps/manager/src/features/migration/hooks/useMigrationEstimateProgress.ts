import { hashKey, type QueryKey } from '@tanstack/react-query'
import { useState } from 'react'
import {
  getMigrationEstimateProgress,
  type MigrationEstimateObserver,
  type MigrationEstimateProgress,
} from '../service/migrationEstimateProgress'

const UI_YIELD_INTERVAL_MS = 32

/** Scope transient progress to the same wallet, selection and route as its query. */
export const useMigrationEstimateProgress = (
  queryKey: QueryKey,
  selectedNames: readonly string[],
) => {
  const identity = hashKey(queryKey)
  const [current, setCurrent] = useState<{
    readonly identity: string
    readonly attempt: symbol
    readonly signal: AbortSignal
    readonly progress: MigrationEstimateProgress
  } | null>(null)

  return {
    progress: current?.identity === identity ? current.progress : undefined,
    start: (signal: AbortSignal) => {
      const attempt = Symbol()
      setCurrent((current) => ({
        identity,
        attempt,
        signal,
        progress:
          current?.identity === identity && current.signal === signal
            ? current.progress
            : getMigrationEstimateProgress({
                selectedNames,
                estimatedNames: [],
                stage: 'checking-names',
              }),
      }))
      let lastYieldAt = performance.now()
      const onProgress: MigrationEstimateObserver = async ({
        stage,
        names,
      }) => {
        signal.throwIfAborted()
        setCurrent((current) => {
          if (
            signal.aborted ||
            current?.identity !== identity ||
            current.attempt !== attempt
          )
            return current
          const progress = getMigrationEstimateProgress({
            selectedNames,
            estimatedNames: names,
            stage,
            previous: current.progress,
          })
          return progress === current.progress
            ? current
            : { ...current, progress }
        })
        // Yield only for real completed work, so CPU-heavy preparation can repaint.
        if (performance.now() - lastYieldAt < UI_YIELD_INTERVAL_MS) return
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        signal.throwIfAborted()
        lastYieldAt = performance.now()
      }
      return { onProgress }
    },
  }
}
