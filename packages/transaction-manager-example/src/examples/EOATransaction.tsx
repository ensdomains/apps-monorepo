import React, { useState } from 'react'
import { useTransaction } from '@ens-apps/transaction-manager'
import type { EOATransactionRequest } from '@ens-apps/transaction-manager'
import { useAccount } from 'wagmi'
import { parseEther, formatEther } from 'viem'

export function EOATransactionExample() {
  const { address } = useAccount()
  const [recipient, setRecipient] = useState('0x0000000000000000000000000000000000000000')
  const [amount, setAmount] = useState('0.001')

  const {
    execute,
    retry,
    cancel,
    state,
    isIdle,
    isLoading,
    isPending,
    isSuccess,
    isError,
    hash,
    receipt,
    error,
    debugReport
  } = useTransaction()

  const handleSend = () => {
    if (!address) return

    const request: EOATransactionRequest = {
      type: 'eoa',
      from: address,
      to: recipient as `0x${string}`,
      value: parseEther(amount),
      chainId: 1 // You might want to get this from wagmi's useChainId
    }

    execute(request, {
      confirmations: 1,
      timeout: 60000,
      retryCount: 3,
      retryDelay: 2000
    })
  }

  const handleExportDebug = () => {
    const report = debugReport()
    if (report) {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `debug-report-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getStateColor = () => {
    if (isIdle) return 'idle'
    if (isLoading) return 'loading'
    if (isPending) return 'pending'
    if (isSuccess) return 'success'
    if (isError) return 'error'
    return 'idle'
  }

  return (
    <div className="example-section">
      <h3>💸 EOA Transaction (Standard Ethereum Transaction)</h3>

      <div className="input-group">
        <input
          type="text"
          placeholder="Recipient Address (0x...)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <input
          type="number"
          placeholder="Amount (ETH)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="0.001"
          min="0"
        />
      </div>

      <div className="button-group">
        <button
          className="primary"
          onClick={handleSend}
          disabled={!address || isLoading || isPending}
        >
          {isLoading ? '⏳ Preparing...' :
           isPending ? '⌛ Confirming...' :
           `Send ${amount} ETH`}
        </button>

        {isError && (
          <>
            <button className="secondary" onClick={retry}>
              🔄 Retry
            </button>
            <button className="danger" onClick={cancel}>
              ❌ Cancel
            </button>
          </>
        )}

        {(isSuccess || isError) && (
          <button className="secondary" onClick={handleExportDebug}>
            📥 Export Debug Report
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: '15px' }}>
        <span>Current State:</span>
        <span className={`state-indicator ${getStateColor()}`}>
          {state}
        </span>
      </div>

      {hash && (
        <div className="transaction-hash">
          <strong>Transaction Hash:</strong><br />
          <a
            href={`https://etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {hash}
          </a>
        </div>
      )}

      {isSuccess && receipt && (
        <div className="status-box success">
          <strong>✅ Transaction Successful!</strong>
          <p>Block Number: {receipt.blockNumber?.toString()}</p>
          <p>Gas Used: {receipt.gasUsed?.toString()}</p>
          <p>Status: {receipt.status}</p>
        </div>
      )}

      {isError && error && (
        <div className="status-box error">
          <strong>❌ Transaction Failed</strong>
          <p>{error.message}</p>
        </div>
      )}

      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          📊 Transaction Details
        </summary>
        <div className="debug-panel">
          <pre>
{JSON.stringify({
  state,
  hash,
  error: error?.message,
  receipt: receipt ? {
    blockNumber: receipt.blockNumber?.toString(),
    gasUsed: receipt.gasUsed?.toString(),
    status: receipt.status
  } : null
}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  )
}