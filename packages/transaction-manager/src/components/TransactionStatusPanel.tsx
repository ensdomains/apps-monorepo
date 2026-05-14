import React from 'react'
import { useActiveTransactions } from '../providers/TransactionManagerProvider'

export interface TransactionStatus {
  id: string
  state: string
  hash?: string
  error?: string
  canCancel: boolean
}

export interface TransactionStatusPanelProps {
  /** Custom render function for the panel */
  render?: (
    transactions: TransactionStatus[],
    onCancel: (id: string) => void,
  ) => React.ReactNode
  /** Show only specific states */
  filter?: string[]
  /** Maximum number of transactions to show */
  maxTransactions?: number
  /** Position of the panel */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Enable the panel */
  enabled?: boolean
}

/**
 * Transaction Status Panel
 *
 * Displays a panel showing all active transactions and their current status.
 *
 * @example
 * ```tsx
 * <TransactionStatusPanel
 *   position="bottom-left"
 *   maxTransactions={5}
 *   render={(transactions, onCancel) => (
 *     <div className="status-panel">
 *       <h3>Active Transactions ({transactions.length})</h3>
 *       {transactions.map(tx => (
 *         <div key={tx.id}>
 *           <span>{tx.state}</span>
 *           {tx.hash && <span>{tx.hash.slice(0, 10)}...</span>}
 *           {tx.canCancel && <button onClick={() => onCancel(tx.id)}>Cancel</button>}
 *         </div>
 *       ))}
 *     </div>
 *   )}
 * />
 * ```
 */
export const TransactionStatusPanel = ({
  render,
  filter,
  maxTransactions,
  position = 'bottom-left',
  enabled = true,
}: TransactionStatusPanelProps) => {
  const activeTransactions = useActiveTransactions()

  // Convert Map to array of transaction statuses
  const transactions: TransactionStatus[] = React.useMemo(() => {
    const txArray: TransactionStatus[] = []

    activeTransactions.forEach((actor, id) => {
      const snapshot = actor.getSnapshot()
      const state = snapshot.value as string
      const context = snapshot.context

      // Apply filter if provided
      if (filter && !filter.includes(state)) {
        return
      }

      txArray.push({
        id,
        state,
        hash: context.hash,
        error: context.error?.message,
        canCancel: state !== 'confirmed' && state !== 'failed',
      })
    })

    // Limit number of transactions if specified
    const limited = maxTransactions ? txArray.slice(-maxTransactions) : txArray

    return limited
  }, [activeTransactions, filter, maxTransactions])

  const handleCancel = (id: string) => {
    const actor = activeTransactions.get(id)
    if (actor) {
      actor.send({ type: 'CANCEL' })
    }
  }

  if (!enabled || transactions.length === 0) {
    return null
  }

  // Use custom render if provided
  if (render) {
    return <>{render(transactions, handleCancel)}</>
  }

  // Default render
  const positionStyles = getPositionStyles(position)

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles,
        width: 320,
        maxHeight: 400,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9998,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #ddd',
          background: '#f5f5f5',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Active Transactions ({transactions.length})
        </h3>
      </div>
      <div
        style={{
          maxHeight: 350,
          overflowY: 'auto',
        }}
      >
        {transactions.map((tx) => (
          <div
            key={tx.id}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #eee',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: getStateColor(tx.state),
                  textTransform: 'uppercase',
                }}
              >
                {tx.state}
              </span>
              {tx.canCancel && (
                <button
                  type="button"
                  onClick={() => handleCancel(tx.id)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: 'transparent',
                    color: '#999',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {tx.hash && (
              <div
                style={{
                  fontSize: 11,
                  color: '#666',
                  fontFamily: 'monospace',
                  marginBottom: 4,
                }}
              >
                {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
              </div>
            )}
            {tx.error && (
              <div
                style={{
                  fontSize: 11,
                  color: '#f44336',
                  marginTop: 4,
                }}
              >
                {tx.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function getPositionStyles(position: TransactionStatusPanelProps['position']) {
  switch (position) {
    case 'top-left':
      return { top: 20, left: 20 }
    case 'top-right':
      return { top: 20, right: 20 }
    case 'bottom-left':
      return { bottom: 20, left: 20 }
    case 'bottom-right':
      return { bottom: 20, right: 20 }
    default:
      return { bottom: 20, left: 20 }
  }
}

function getStateColor(state: string): string {
  switch (state) {
    case 'confirmed':
      return '#4CAF50'
    case 'failed':
      return '#f44336'
    case 'pending':
      return '#ff9800'
    case 'submitting':
    case 'preparing':
      return '#2196F3'
    default:
      return '#666'
  }
}
