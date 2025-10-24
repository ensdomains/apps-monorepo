import React, { useEffect, useState } from 'react'
import { useActiveTransactions } from '../providers/TransactionActorManagerProvider'
import { useSelector } from '@xstate/react'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  txId: string
  timestamp: number
}

export interface GlobalTransactionToastsProps {
  /** Custom render function for toasts */
  render?: (toasts: Toast[], onDismiss: (id: string) => void) => React.ReactNode
  /** Auto-dismiss duration in ms (0 = no auto-dismiss) */
  autoDismiss?: number
  /** Maximum number of toasts to show */
  maxToasts?: number
  /** Enable toast notifications */
  enabled?: boolean
}

/**
 * Global Transaction Toasts
 *
 * Monitors all active transactions and displays toast notifications for state changes.
 *
 * @example
 * ```tsx
 * <GlobalTransactionToasts
 *   autoDismiss={5000}
 *   maxToasts={3}
 *   render={(toasts, onDismiss) => (
 *     <div className="toast-container">
 *       {toasts.map(toast => (
 *         <div key={toast.id} className={`toast toast-${toast.type}`}>
 *           {toast.message}
 *           <button onClick={() => onDismiss(toast.id)}>×</button>
 *         </div>
 *       ))}
 *     </div>
 *   )}
 * />
 * ```
 */
export function GlobalTransactionToasts({
  render,
  autoDismiss = 5000,
  maxToasts = 5,
  enabled = true,
}: GlobalTransactionToastsProps) {
  const transactions = useActiveTransactions()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [seenStates, setSeenStates] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    if (!enabled) return

    const subscriptions: Array<{ unsubscribe: () => void }> = []

    // Subscribe to each transaction actor
    transactions.forEach((actor, txId) => {
      const subscription = actor.subscribe((snapshot) => {
        const state = snapshot.value as string
        const context = snapshot.context

        // Track which states we've already shown toasts for
        const seen = seenStates.get(txId) || new Set<string>()

        // Skip if we've already shown a toast for this state
        if (seen.has(state)) return

        let toast: Toast | null = null

        // Generate toasts based on state
        switch (state) {
          case 'submitting':
            toast = {
              id: `${txId}-submitting`,
              type: 'info',
              message: 'Submitting transaction...',
              txId,
              timestamp: Date.now(),
            }
            break

          case 'pending':
            toast = {
              id: `${txId}-pending`,
              type: 'info',
              message: `Transaction pending: ${context.hash?.slice(0, 10)}...`,
              txId,
              timestamp: Date.now(),
            }
            break

          case 'confirmed':
            toast = {
              id: `${txId}-confirmed`,
              type: 'success',
              message: 'Transaction confirmed!',
              txId,
              timestamp: Date.now(),
            }
            break

          case 'failed':
            toast = {
              id: `${txId}-failed`,
              type: 'error',
              message: `Transaction failed: ${context.error?.message || 'Unknown error'}`,
              txId,
              timestamp: Date.now(),
            }
            break
        }

        if (toast) {
          // Mark this state as seen
          const updatedSeen = new Set(seen).add(state)
          setSeenStates((prev) => new Map(prev).set(txId, updatedSeen))

          // Add toast
          setToasts((prev) => {
            const newToasts = [...prev, toast!]
            // Limit number of toasts
            return newToasts.slice(-maxToasts)
          })

          // Auto-dismiss if enabled
          if (autoDismiss > 0) {
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast!.id))
            }, autoDismiss)
          }
        }
      })

      subscriptions.push(subscription)
    })

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe())
    }
  }, [transactions, enabled, autoDismiss, maxToasts, seenStates])

  const handleDismiss = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId))
  }

  if (!enabled || toasts.length === 0) {
    return null
  }

  // Use custom render if provided
  if (render) {
    return <>{render(toasts, handleDismiss)}</>
  }

  // Default render
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 400,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '12px 16px',
            background: getToastColor(toast.type),
            color: '#fff',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <span style={{ flex: 1, fontSize: 14 }}>{toast.message}</span>
          <button
            onClick={() => handleDismiss(toast.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 20,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

function getToastColor(type: Toast['type']): string {
  switch (type) {
    case 'success':
      return '#4CAF50'
    case 'error':
      return '#f44336'
    case 'warning':
      return '#ff9800'
    case 'info':
    default:
      return '#2196F3'
  }
}
