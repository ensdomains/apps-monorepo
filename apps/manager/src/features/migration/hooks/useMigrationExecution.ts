import { useEffect, useMemo, useRef, useState } from 'react'
import { useMigrateNames } from '@/features/migration/hooks/useMigrateNames'
import {
  getMigrationStepCount,
  getMigrationStepDescriptions,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'

function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)

  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

export function useMigrationExecution(
  domains: V1Domain[],
  onComplete: (result: MigrationResult) => void,
  onError: (error: string) => void,
  hugDelay: number,
) {
  const startedRef = useRef(false)
  const [done, setDone] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { migrateAsync, progress } = useMigrateNames()
  const { ownerAddress } = useSmartAccountContext()

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const { stepCount, stepDescriptions } = useMemo(() => {
    if (!ownerAddress || domains.length === 0) {
      return { stepCount: 0, stepDescriptions: [] }
    }
    return {
      stepCount: getMigrationStepCount(domains, ownerAddress),
      stepDescriptions: getMigrationStepDescriptions(domains, ownerAddress),
    }
  }, [domains, ownerAddress])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (startedRef.current || domains.length === 0) return
    startedRef.current = true

    migrateAsync(domains)
      .then((result) => {
        setDone(true)
        setTimeout(() => onCompleteRef.current(result), hugDelay)
      })
      .catch((err: unknown) => {
        const msg = extractErrorMessage(err)
        setErrorMessage(msg)
        setTimeout(() => onErrorRef.current(msg), 1500)
      })
  }, [])

  return {
    done,
    errorMessage,
    progress,
    stepCount,
    stepDescriptions,
  }
}
