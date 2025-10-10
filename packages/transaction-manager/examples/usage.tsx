import React from 'react'
import { useMachine } from '@xstate/react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { transactionMachine, TransactionService, useAuditTrail } from '@ens-apps/transaction-manager'
import type { EOATransactionRequest, ERC4337UserOperation } from '@ens-apps/transaction-manager'

/**
 * Example 1: Basic EOA Transaction
 */
export function SendEthButton() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [state, send] = useMachine(transactionMachine, {
    input: {
      transactionService: new TransactionService(publicClient!, walletClient)
    }
  })

  const handleSend = () => {
    const request: EOATransactionRequest = {
      type: 'eoa',
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
      to: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      value: BigInt(1e18), // 1 ETH
      chainId: 1
    }

    send({
      type: 'EXECUTE',
      request,
      options: {
        confirmations: 2,
        timeout: 60000,
        retryCount: 3,
        retryDelay: 2000
      }
    })
  }

  const isLoading = state.matches('preparing') || state.matches('submitting')
  const isPending = state.matches('pending') || state.matches('confirming') || state.matches('checkingFallback')
  const isSuccess = state.matches('success')
  const isError = state.value.toString().startsWith('error')

  return (
    <div>
      <h3>Send ETH (EOA)</h3>

      <button
        onClick={handleSend}
        disabled={isLoading || isPending}
      >
        {isLoading ? 'Preparing...' :
         isPending ? 'Waiting for confirmation...' :
         'Send 1 ETH'}
      </button>

      {isError && (
        <div>
          <p>Error: {state.context.error?.message}</p>
          <button onClick={() => send({ type: 'RETRY' })}>Retry</button>
        </div>
      )}

      {isSuccess && (
        <div>
          <p>Success! Transaction hash: {state.context.hash}</p>
          <a
            href={`https://etherscan.io/tx/${state.context.hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Etherscan
          </a>
        </div>
      )}

      <p>State: {state.value.toString()}</p>
    </div>
  )
}

/**
 * Example 2: ERC-4337 User Operation
 */
export function SmartAccountTransaction() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [state, send] = useMachine(transactionMachine, {
    input: {
      transactionService: new TransactionService(publicClient!, walletClient)
    }
  })

  const handleSendUserOp = () => {
    const userOp: ERC4337UserOperation = {
      type: 'erc4337',
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8', // Smart account address
      to: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      value: BigInt(1e18),
      callData: '0x', // Encoded call data
      callGasLimit: BigInt(100000),
      verificationGasLimit: BigInt(100000),
      preVerificationGas: BigInt(50000),
      maxFeePerGas: BigInt(20e9), // 20 gwei
      maxPriorityFeePerGas: BigInt(2e9), // 2 gwei
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // v0.6 EntryPoint
      chainId: 1
    }

    send({
      type: 'EXECUTE',
      request: userOp,
      options: {
        confirmations: 1,
        timeout: 120000 // 2 minutes for 4337 ops
      }
    })
  }

  const isLoading = state.matches('preparing') || state.matches('submitting')
  const isPending = state.matches('pending') || state.matches('confirming')
  const isSuccess = state.matches('success')
  const isError = state.value.toString().startsWith('error')

  return (
    <div>
      <h3>Smart Account Transaction (ERC-4337)</h3>

      <button
        onClick={handleSendUserOp}
        disabled={isLoading || isPending}
      >
        {isLoading ? 'Preparing UserOp...' :
         isPending ? 'UserOp pending...' :
         'Send via Smart Account'}
      </button>

      {isError && (
        <div>
          <p>Error: {state.context.error?.message}</p>
        </div>
      )}

      {isSuccess && (
        <div>
          <p>Success! UserOp hash: {state.context.hash}</p>
        </div>
      )}

      <p>State: {state.value.toString()}</p>
    </div>
  )
}

/**
 * Example 3: Audit Trail Dashboard
 */
export function AuditTrailDashboard() {
  const {
    getDebugReport,
    exportAudit,
    importAudit,
    getTransitionHistory,
    clearAudit,
    addEntry
  } = useAuditTrail()

  const [history, setHistory] = React.useState<any[]>([])
  const [report, setReport] = React.useState<any>(null)

  const handleViewHistory = () => {
    const transitions = getTransitionHistory({
      fromTime: Date.now() - 3600000, // Last hour
      includeErrors: true
    })
    setHistory(transitions)
  }

  const handleGenerateReport = () => {
    const debugReport = getDebugReport()
    setReport(debugReport)
    console.log('Debug Report:', debugReport)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        await importAudit(file)
        alert('Audit data imported successfully')
      } catch (error) {
        alert('Failed to import audit data')
      }
    }
  }

  const handleAddCustomEntry = () => {
    addEntry(
      'info',
      'Custom audit entry',
      {
        timestamp: Date.now(),
        source: 'manual',
        userId: 'test-user'
      }
    )
  }

  return (
    <div>
      <h3>Audit Trail Dashboard</h3>

      <div>
        <button onClick={handleViewHistory}>View History</button>
        <button onClick={handleGenerateReport}>Generate Report</button>
        <button onClick={exportAudit}>Export Audit</button>
        <button onClick={clearAudit}>Clear Audit</button>
        <button onClick={handleAddCustomEntry}>Add Custom Entry</button>
      </div>

      <div>
        <label>
          Import Audit:
          <input type="file" accept=".json" onChange={handleImport} />
        </label>
      </div>

      {history.length > 0 && (
        <div>
          <h4>Recent Transitions ({history.length})</h4>
          <ul>
            {history.slice(0, 10).map((t, i) => (
              <li key={i}>
                {new Date(t.timestamp).toLocaleTimeString()} -
                {t.machineId}: {t.fromState} → {t.toState}
                {t.error && <span> (Error)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div>
          <h4>Debug Report</h4>
          <pre>{JSON.stringify(report, null, 2).slice(0, 500)}...</pre>
          <p>
            Total Transitions: {report.transitions.length}<br />
            Error Rate: {report.errorSummary.errorRate.toFixed(2)}%<br />
            Avg Transition Time: {report.performanceMetrics.avgTransitionTime.toFixed(0)}ms
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Example 4: Multi-step Flow (Name Registration)
 */
export function NameRegistrationFlow() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [commitState, sendCommit] = useMachine(transactionMachine, {
    input: {
      transactionService: new TransactionService(publicClient!, walletClient)
    }
  })

  const [registerState, sendRegister] = useMachine(transactionMachine, {
    input: {
      transactionService: new TransactionService(publicClient!, walletClient)
    }
  })

  const [step, setStep] = React.useState<'commit' | 'wait' | 'register' | 'complete'>('commit')

  const handleCommit = () => {
    const request: EOATransactionRequest = {
      type: 'eoa',
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
      to: '0xENS_REGISTRAR_ADDRESS',
      data: '0x...', // Encoded commit data
      chainId: 1
    }

    sendCommit({
      type: 'EXECUTE',
      request,
      options: { confirmations: 1 }
    })
  }

  const handleRegister = () => {
    const request: EOATransactionRequest = {
      type: 'eoa',
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
      to: '0xENS_REGISTRAR_ADDRESS',
      data: '0x...', // Encoded register data
      value: BigInt(5e16), // Registration fee
      chainId: 1
    }

    sendRegister({
      type: 'EXECUTE',
      request,
      options: { confirmations: 2 }
    })
  }

  // Handle state transitions
  React.useEffect(() => {
    if (commitState.matches('success') && step === 'commit') {
      setStep('wait')
      // Wait 60 seconds
      setTimeout(() => setStep('register'), 60000)
    }
  }, [commitState.value, step])

  React.useEffect(() => {
    if (registerState.matches('success') && step === 'register') {
      setStep('complete')
    }
  }, [registerState.value, step])

  const commitLoading = commitState.matches('preparing') || commitState.matches('submitting')
  const commitPending = commitState.matches('pending')
  const registerLoading = registerState.matches('preparing') || registerState.matches('submitting')
  const registerPending = registerState.matches('pending')

  return (
    <div>
      <h3>ENS Name Registration Flow</h3>

      <div>
        <h4>Step 1: Commit</h4>
        <button
          onClick={handleCommit}
          disabled={commitLoading || commitPending || step !== 'commit'}
        >
          {commitLoading ? 'Committing...' :
           commitPending ? 'Waiting...' :
           commitState.matches('success') ? 'Committed!' :
           'Start Commit'}
        </button>
        {commitState.context.hash && <p>Commit TX: {commitState.context.hash}</p>}
      </div>

      {step === 'wait' && (
        <div>
          <h4>Step 2: Wait Period</h4>
          <p>Waiting 60 seconds before registration...</p>
        </div>
      )}

      {(step === 'register' || step === 'complete') && (
        <div>
          <h4>Step 3: Register</h4>
          <button
            onClick={handleRegister}
            disabled={registerLoading || registerPending || step !== 'register'}
          >
            {registerLoading ? 'Registering...' :
             registerPending ? 'Waiting...' :
             registerState.matches('success') ? 'Registered!' :
             'Complete Registration'}
          </button>
          {registerState.context.hash && <p>Register TX: {registerState.context.hash}</p>}
        </div>
      )}

      {step === 'complete' && (
        <div>
          <h4>Registration Complete!</h4>
          <p>Your ENS name has been successfully registered.</p>
        </div>
      )}
    </div>
  )
}