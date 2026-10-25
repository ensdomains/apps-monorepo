import { useEffect, useRef, useState } from 'react'
import type { SubnameMigrationImpactState } from './useSubnameMigrationImpact'

type Action = 'start' | 'retry'

const focusedElement = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null

export const useSubnameMigrationConfirmation = ({
  impact,
  onConfirm,
}: {
  readonly impact: SubnameMigrationImpactState
  readonly onConfirm: (action: Action) => boolean | Promise<boolean>
}) => {
  const [action, setAction] = useState<Action | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const requestRevision = useRef(0)
  const isBusy = useRef(false)
  const invokingElement = useRef<HTMLElement | null>(null)
  const reviewKey = impact.canReview ? impact.selectionKey : null
  const selection = useRef(reviewKey)
  const cancel = () => {
    requestRevision.current += 1
    setAction(null)
  }

  useEffect(() => {
    // Never carry an open decision across selections or execution contexts.
    if (reviewKey === null || selection.current !== reviewKey) {
      requestRevision.current += 1
      setAction(null)
    }
    selection.current = reviewKey
  }, [reviewKey])

  useEffect(
    () => () => {
      requestRevision.current += 1
    },
    [],
  )

  const isCurrentRequest = (revision: number, selectionKey: string) =>
    requestRevision.current === revision && selection.current === selectionKey

  const request = async (requestedAction: Action): Promise<boolean> => {
    if (isBusy.current || !impact.canReview) return false
    invokingElement.current = focusedElement()
    const revision = ++requestRevision.current
    const selectionKey = impact.selectionKey
    if (impact.status === 'ready' && impact.impact?.affectedCount === 0) {
      isBusy.current = true
      setIsChecking(true)
      try {
        const isSafe = await impact.checkBeforeStart()
        if (!isCurrentRequest(revision, selectionKey)) return false
        if (isSafe) return await onConfirm(requestedAction)
      } finally {
        isBusy.current = false
        setIsChecking(false)
      }
    }
    if (!isCurrentRequest(revision, selectionKey)) return false
    setAction(requestedAction)
    impact.retry()
    return false
  }

  const confirm = async () => {
    if (
      isBusy.current ||
      action === null ||
      impact.status !== 'ready' ||
      !impact.canReview ||
      !impact.impact ||
      impact.impact.affectedCount > 0
    )
      return
    const revision = requestRevision.current
    isBusy.current = true
    setIsChecking(true)
    try {
      const isSafe = await impact.checkBeforeStart(impact.impact?.fingerprint)
      if (!isSafe || requestRevision.current !== revision) return
      // Unsupported subnames are a hard stop. Only a fresh, unchanged result
      // proving zero affected names can start or retry the upgrade.
      if (await onConfirm(action)) setAction(null)
    } finally {
      isBusy.current = false
      setIsChecking(false)
    }
  }

  return {
    isOpen: action !== null,
    isChecking,
    hasAcknowledgedImpact: false,
    acknowledgeImpact: (_isAcknowledged: boolean) => {},
    request,
    confirm,
    cancel,
    restoreFocus: () => invokingElement.current?.focus(),
  }
}
