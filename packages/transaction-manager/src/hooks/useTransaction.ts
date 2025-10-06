import { useCallback, useState, useEffect } from 'react'
import { createActor } from 'xstate'
import { usePublicClient, useWalletClient } from 'wagmi'
import { transactionMachine } from '../machines/transaction.machine'
import { TransactionService } from '../services/transaction.service'
import { AuditTrailService } from '../services/audit-trail.service'
import type { TransactionRequest, TransactionOptions } from '../types/transaction.types'

export interface UseTransactionReturn {
  execute: (request: TransactionRequest, options?: TransactionOptions) => void
  retry: () => void
  cancel: () => void
  forceSuccess: () => void
  state: string
  isIdle: boolean
  isLoading: boolean
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  hash?: `0x${string}`
  receipt?: any
  error?: Error
  debugReport: () => any
}

let globalAuditService: AuditTrailService | null = null

export function useTransaction(): UseTransactionReturn {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [actor, setActor] = useState<any>(null)
  const [snapshot, setSnapshot] = useState<any>({ value: 'idle', context: {} })

  useEffect(() => {
    if (actor) {
      const subscription = actor.subscribe((state: any) => {
        setSnapshot(state)
      })
      return () => subscription.unsubscribe()
    }
  }, [actor])

  const send = useCallback((event: any) => {
    if (actor) {
      actor.send(event)
    }
  }, [actor])

  // Initialize audit service singleton
  useEffect(() => {
    if (!globalAuditService && typeof window !== 'undefined') {
      globalAuditService = new AuditTrailService()
    }
  }, [])

  const execute = useCallback((request: TransactionRequest, options?: TransactionOptions) => {
    if (!publicClient) {
      console.error('No public client available')
      return
    }

    const transactionService = new TransactionService(publicClient, walletClient || undefined)

    const newActor = createActor(transactionMachine, {
      input: {
        request,
        options: options || {},
        transactionService,
        auditService: globalAuditService || undefined
      }
    })

    newActor.start()
    setActor(newActor)
  }, [publicClient, walletClient])

  const retry = useCallback(() => {
    send({ type: 'RETRY' })
  }, [send])

  const cancel = useCallback(() => {
    send({ type: 'CANCEL' })
  }, [send])

  const forceSuccess = useCallback(() => {
    send({ type: 'FORCE_SUCCESS' })
  }, [send])

  const debugReport = useCallback(() => {
    if (globalAuditService) {
      return globalAuditService.generateDebugReport(snapshot.context?.hash)
    }
    return null
  }, [snapshot.context?.hash])

  const state = typeof snapshot.value === 'object'
    ? Object.keys(snapshot.value).join('.')
    : String(snapshot.value || 'idle')

  return {
    execute,
    retry,
    cancel,
    forceSuccess,
    state,
    isIdle: state === 'idle',
    isLoading: state === 'submitting' || state === 'preparing',
    isPending: state === 'pending' || state === 'confirming' || state === 'checkingFallback',
    isSuccess: state === 'success',
    isError: state.startsWith('error'),
    hash: snapshot.context?.hash,
    receipt: snapshot.context?.receipt,
    error: snapshot.context?.error,
    debugReport
  }
}