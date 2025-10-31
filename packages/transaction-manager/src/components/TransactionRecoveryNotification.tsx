import React from 'react'
import { useTransactionActorManager, useRecoveredTransactions } from '../providers/TransactionManagerProvider'

export interface TransactionRecoveryNotificationProps {
  /** Custom render function for the notification */
  render?: (props: {
    count: number
    onRecover: () => void
    onDismiss: () => void
    transactions: any[]
  }) => React.ReactNode
  /** Auto-recover without showing notification */
  autoRecover?: boolean
}

/**
 * Transaction Recovery Notification
 *
 * Displays a notification when pending transactions are recovered from IndexedDB.
 * Gives the user the option to resume or dismiss the transactions.
 *
 * @example
 * ```tsx
 * <TransactionRecoveryNotification
 *   render={({ count, onRecover, onDismiss }) => (
 *     <div className="notification">
 *       {count} pending transaction(s) found. Do you want to resume?
 *       <button onClick={onRecover}>Resume</button>
 *       <button onClick={onDismiss}>Dismiss</button>
 *     </div>
 *   )}
 * />
 * ```
 */
export function TransactionRecoveryNotification({
  render,
  autoRecover = false,
}: TransactionRecoveryNotificationProps) {
  // TODO: Implement recovery methods in TransactionManagerProvider
  // const { recoverTransactions, clearRecovered } = useTransactionActorManager()
  const recoveredTransactions = useRecoveredTransactions()

  const [dismissed, setDismissed] = React.useState(false)

  // Auto-recover if enabled
  React.useEffect(() => {
    if (autoRecover && recoveredTransactions.length > 0) {
      // TODO: Implement recoverTransactions()
      console.log('🔄 [RECOVERY] Auto-recover not yet implemented')
    }
  }, [autoRecover, recoveredTransactions.length])

  const handleRecover = () => {
    // TODO: Implement recoverTransactions()
    console.log('🔄 [RECOVERY] Manual recover not yet implemented')
    setDismissed(true)
  }

  const handleDismiss = () => {
    // TODO: Implement clearRecovered()
    console.log('🔄 [RECOVERY] Clear recovered not yet implemented')
    setDismissed(true)
  }

  // Don't show if dismissed or no transactions to recover
  if (dismissed || recoveredTransactions.length === 0 || autoRecover) {
    return null
  }

  // Use custom render if provided
  if (render) {
    return (
      <>
        {render({
          count: recoveredTransactions.length,
          onRecover: handleRecover,
          onDismiss: handleDismiss,
          transactions: recoveredTransactions,
        })}
      </>
    )
  }

  // Default render
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        padding: '16px 24px',
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        maxWidth: 400,
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600 }}>
        Pending Transactions Found
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#666' }}>
        {recoveredTransactions.length} pending transaction(s) were found from a previous session.
        Would you like to resume tracking them?
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleRecover}
          style={{
            padding: '8px 16px',
            background: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Resume ({recoveredTransactions.length})
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '8px 16px',
            background: '#fff',
            color: '#666',
            border: '1px solid #ddd',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
