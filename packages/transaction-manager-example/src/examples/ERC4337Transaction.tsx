import React, { useState } from 'react'
import { useTransaction } from '@ens-apps/transaction-manager'
import type { ERC4337UserOperation } from '@ens-apps/transaction-manager'
import { useAccount } from 'wagmi'
import { parseEther, encodeFunctionData } from 'viem'

export function ERC4337Example() {
  const { address } = useAccount()
  const [recipient, setRecipient] = useState('0x0000000000000000000000000000000000000000')
  const [amount, setAmount] = useState('0.001')

  const {
    execute,
    retry,
    state,
    isLoading,
    isPending,
    isSuccess,
    isError,
    hash,
    error
  } = useTransaction()

  const handleSendUserOp = () => {
    if (!address) return

    // In a real implementation, you would:
    // 1. Get the smart account address
    // 2. Build the actual callData using the account's execute function
    // 3. Estimate gas limits properly
    // 4. Sign with the account owner

    const userOp: ERC4337UserOperation = {
      type: 'erc4337',
      from: address, // This would be the smart account address
      to: recipient as `0x${string}`,
      value: parseEther(amount),
      callData: '0x', // Would be encoded execute call
      callGasLimit: BigInt(100000),
      verificationGasLimit: BigInt(100000),
      preVerificationGas: BigInt(50000),
      maxFeePerGas: BigInt(20e9), // 20 gwei
      maxPriorityFeePerGas: BigInt(2e9), // 2 gwei
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as `0x${string}`, // v0.6 EntryPoint
      chainId: 1
    }

    execute(userOp, {
      confirmations: 1,
      timeout: 120000 // 2 minutes for 4337 ops
    })
  }

  const getStateColor = () => {
    if (state === 'idle') return 'idle'
    if (isLoading) return 'loading'
    if (isPending) return 'pending'
    if (isSuccess) return 'success'
    if (isError) return 'error'
    return 'idle'
  }

  return (
    <div className="example-section">
      <h3>🤖 ERC-4337 Smart Account Transaction</h3>

      <div className="status-box info">
        <strong>ℹ️ Note:</strong> This is a demonstration of ERC-4337 transaction flow.
        In production, you would need:
        <ul style={{ marginTop: '10px', marginLeft: '20px' }}>
          <li>A deployed smart account contract</li>
          <li>A bundler service (like Pimlico, Alchemy, or Stackup)</li>
          <li>Proper gas estimation from the bundler</li>
          <li>Account signature generation</li>
        </ul>
      </div>

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
          onClick={handleSendUserOp}
          disabled={!address || isLoading || isPending}
        >
          {isLoading ? '⏳ Building UserOp...' :
           isPending ? '⌛ UserOp Pending...' :
           '🚀 Send via Smart Account'}
        </button>

        {isError && (
          <button className="secondary" onClick={retry}>
            🔄 Retry
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
          <strong>UserOp Hash:</strong><br />
          <code>{hash}</code>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            Note: This would be tracked on the bundler's explorer, not Etherscan directly
          </p>
        </div>
      )}

      {isSuccess && (
        <div className="status-box success">
          <strong>✅ UserOp Executed Successfully!</strong>
          <p>The smart account transaction has been processed by the bundler and included on-chain.</p>
        </div>
      )}

      {isError && error && (
        <div className="status-box error">
          <strong>❌ UserOp Failed</strong>
          <p>{error.message}</p>
          <p style={{ marginTop: '10px', fontSize: '12px' }}>
            Common issues: Bundler not configured, invalid UserOp, insufficient account balance
          </p>
        </div>
      )}

      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          🔍 ERC-4337 Flow Explanation
        </summary>
        <div className="debug-panel">
          <pre>
{`1. Build UserOperation
   - Sender: Smart Account Address
   - CallData: Encoded execute() call
   - Gas Limits: From bundler estimation

2. Sign UserOperation
   - Owner signs the operation hash
   - Attach signature to UserOp

3. Submit to Bundler
   - Bundler validates UserOp
   - Bundles with other UserOps
   - Submits to EntryPoint

4. EntryPoint Execution
   - Validates account
   - Executes operation
   - Handles gas payment

Current State: ${state}
Type: ERC-4337 UserOperation`}
          </pre>
        </div>
      </details>
    </div>
  )
}