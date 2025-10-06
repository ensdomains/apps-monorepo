import React, { useState, useEffect } from 'react'
import { useTransaction } from '@ens-apps/transaction-manager'
import type { EOATransactionRequest } from '@ens-apps/transaction-manager'
import { useAccount } from 'wagmi'
import { parseEther, keccak256, toBytes } from 'viem'

type FlowStep = 'idle' | 'commit' | 'waiting' | 'register' | 'complete'

export function MultiStepFlow() {
  const { address } = useAccount()
  const [nameToRegister, setNameToRegister] = useState('example')
  const [flowStep, setFlowStep] = useState<FlowStep>('idle')
  const [waitTimeLeft, setWaitTimeLeft] = useState(0)
  const [commitmentHash, setCommitmentHash] = useState<string>('')

  const commitTx = useTransaction()
  const registerTx = useTransaction()

  // Simulate wait period countdown
  useEffect(() => {
    if (flowStep === 'waiting' && waitTimeLeft > 0) {
      const timer = setTimeout(() => {
        setWaitTimeLeft(waitTimeLeft - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (flowStep === 'waiting' && waitTimeLeft === 0) {
      setFlowStep('register')
    }
  }, [flowStep, waitTimeLeft])

  // Handle commit success
  useEffect(() => {
    if (commitTx.isSuccess && flowStep === 'commit') {
      setFlowStep('waiting')
      setWaitTimeLeft(10) // 10 seconds for demo (would be 60+ in production)
    }
  }, [commitTx.isSuccess, flowStep])

  // Handle register success
  useEffect(() => {
    if (registerTx.isSuccess && flowStep === 'register') {
      setFlowStep('complete')
    }
  }, [registerTx.isSuccess, flowStep])

  const startFlow = () => {
    if (!address || !nameToRegister) return

    // Generate commitment (simplified - real ENS uses more complex commitment)
    const commitment = keccak256(toBytes(`${nameToRegister}-${address}-${Date.now()}`))
    setCommitmentHash(commitment)
    setFlowStep('commit')

    // Execute commit transaction
    const commitRequest: EOATransactionRequest = {
      type: 'eoa',
      from: address,
      to: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as `0x${string}`, // ENS Registry (example)
      data: commitment as `0x${string}`,
      chainId: 1
    }

    commitTx.execute(commitRequest, {
      confirmations: 1,
      timeout: 60000
    })
  }

  const handleRegister = () => {
    if (!address || flowStep !== 'register') return

    // Execute register transaction
    const registerRequest: EOATransactionRequest = {
      type: 'eoa',
      from: address,
      to: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as `0x${string}`, // ENS Registry (example)
      data: `0x${nameToRegister}${commitmentHash.slice(2)}` as `0x${string}`, // Simplified
      value: parseEther('0.005'), // Registration fee
      chainId: 1
    }

    registerTx.execute(registerRequest, {
      confirmations: 2,
      timeout: 120000
    })
  }

  const resetFlow = () => {
    setFlowStep('idle')
    setWaitTimeLeft(0)
    setCommitmentHash('')
    // Note: Transaction hooks maintain their own state
  }

  const getStepStatus = (step: FlowStep) => {
    const currentStepIndex = ['idle', 'commit', 'waiting', 'register', 'complete'].indexOf(flowStep)
    const stepIndex = ['idle', 'commit', 'waiting', 'register', 'complete'].indexOf(step)

    if (stepIndex < currentStepIndex) return 'complete'
    if (stepIndex === currentStepIndex) return 'active'
    return 'pending'
  }

  return (
    <div className="example-section">
      <h3>🔄 Multi-Step Transaction Flow (ENS-style Registration)</h3>

      <div className="status-box info">
        <strong>ℹ️ Demo Flow:</strong>
        <p>This simulates a commit-reveal pattern similar to ENS name registration:</p>
        <ol style={{ marginTop: '10px', marginLeft: '20px' }}>
          <li>Commit: Submit commitment hash</li>
          <li>Wait: Prevent front-running (10s demo, 60s+ in production)</li>
          <li>Register: Reveal and complete registration</li>
        </ol>
      </div>

      {flowStep === 'idle' && (
        <div>
          <div className="input-group">
            <input
              type="text"
              placeholder="Name to register"
              value={nameToRegister}
              onChange={(e) => setNameToRegister(e.target.value)}
            />
            <button className="primary" onClick={startFlow} disabled={!address || !nameToRegister}>
              🚀 Start Registration Flow
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        {/* Step 1: Commit */}
        <div className={`step-section ${getStepStatus('commit')}`}
             style={{
               padding: '15px',
               marginBottom: '15px',
               borderRadius: '8px',
               background: getStepStatus('commit') === 'complete' ? '#e8f5e9' :
                          getStepStatus('commit') === 'active' ? '#fff3e0' : '#f5f5f5',
               border: `2px solid ${
                 getStepStatus('commit') === 'complete' ? '#4caf50' :
                 getStepStatus('commit') === 'active' ? '#ff9800' : '#e0e0e0'
               }`
             }}>
          <h4>Step 1: Commit Transaction</h4>
          {flowStep === 'commit' && (
            <>
              <p>Submitting commitment hash to prevent front-running...</p>
              <div style={{ marginTop: '10px' }}>
                State: <span className={`state-indicator ${commitTx.isLoading ? 'loading' : commitTx.isPending ? 'pending' : ''}`}>
                  {commitTx.state}
                </span>
              </div>
              {commitTx.hash && (
                <div className="transaction-hash">
                  Commit TX: {commitTx.hash.slice(0, 10)}...
                </div>
              )}
            </>
          )}
          {getStepStatus('commit') === 'complete' && (
            <p>✅ Commitment submitted successfully!</p>
          )}
        </div>

        {/* Step 2: Wait */}
        <div className={`step-section ${getStepStatus('waiting')}`}
             style={{
               padding: '15px',
               marginBottom: '15px',
               borderRadius: '8px',
               background: getStepStatus('waiting') === 'complete' ? '#e8f5e9' :
                          getStepStatus('waiting') === 'active' ? '#fff3e0' : '#f5f5f5',
               border: `2px solid ${
                 getStepStatus('waiting') === 'complete' ? '#4caf50' :
                 getStepStatus('waiting') === 'active' ? '#ff9800' : '#e0e0e0'
               }`
             }}>
          <h4>Step 2: Wait Period</h4>
          {flowStep === 'waiting' && (
            <div>
              <p>Waiting to prevent front-running attacks...</p>
              <div style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#ff9800',
                marginTop: '10px'
              }}>
                ⏱️ {waitTimeLeft} seconds remaining
              </div>
              <div style={{
                marginTop: '10px',
                height: '4px',
                background: '#e0e0e0',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  background: '#ff9800',
                  width: `${((10 - waitTimeLeft) / 10) * 100}%`,
                  transition: 'width 1s linear'
                }} />
              </div>
            </div>
          )}
          {getStepStatus('waiting') === 'complete' && (
            <p>✅ Wait period complete!</p>
          )}
        </div>

        {/* Step 3: Register */}
        <div className={`step-section ${getStepStatus('register')}`}
             style={{
               padding: '15px',
               marginBottom: '15px',
               borderRadius: '8px',
               background: getStepStatus('register') === 'complete' ? '#e8f5e9' :
                          getStepStatus('register') === 'active' ? '#fff3e0' : '#f5f5f5',
               border: `2px solid ${
                 getStepStatus('register') === 'complete' ? '#4caf50' :
                 getStepStatus('register') === 'active' ? '#ff9800' : '#e0e0e0'
               }`
             }}>
          <h4>Step 3: Register Transaction</h4>
          {flowStep === 'register' && (
            <>
              <p>Ready to complete registration!</p>
              <button
                className="primary"
                onClick={handleRegister}
                disabled={registerTx.isLoading || registerTx.isPending}
                style={{ marginTop: '10px' }}
              >
                {registerTx.isLoading ? '⏳ Registering...' :
                 registerTx.isPending ? '⌛ Confirming...' :
                 '✍️ Complete Registration'}
              </button>
              {registerTx.state !== 'idle' && (
                <div style={{ marginTop: '10px' }}>
                  State: <span className={`state-indicator ${
                    registerTx.isLoading ? 'loading' :
                    registerTx.isPending ? 'pending' :
                    registerTx.isSuccess ? 'success' : ''
                  }`}>
                    {registerTx.state}
                  </span>
                </div>
              )}
              {registerTx.hash && (
                <div className="transaction-hash">
                  Register TX: {registerTx.hash.slice(0, 10)}...
                </div>
              )}
            </>
          )}
          {getStepStatus('register') === 'complete' && (
            <p>✅ Registration transaction confirmed!</p>
          )}
        </div>
      </div>

      {flowStep === 'complete' && (
        <div className="status-box success">
          <h4>🎉 Registration Complete!</h4>
          <p>Successfully registered <strong>{nameToRegister}</strong></p>
          <p style={{ marginTop: '10px' }}>
            Commit TX: {commitTx.hash?.slice(0, 10)}...
          </p>
          <p>
            Register TX: {registerTx.hash?.slice(0, 10)}...
          </p>
          <button className="secondary" onClick={resetFlow} style={{ marginTop: '15px' }}>
            🔄 Start New Registration
          </button>
        </div>
      )}

      {(commitTx.isError || registerTx.isError) && (
        <div className="status-box error">
          <strong>❌ Flow Error</strong>
          <p>{commitTx.error?.message || registerTx.error?.message}</p>
          <button className="secondary" onClick={resetFlow} style={{ marginTop: '10px' }}>
            🔄 Reset Flow
          </button>
        </div>
      )}
    </div>
  )
}