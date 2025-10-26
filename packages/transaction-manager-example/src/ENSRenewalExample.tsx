import React, { useReducer, useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'
import { formatEther } from 'viem'
import { useSelector } from '@xstate/react'
import { getENSRenewalPrice, initializeRhinestoneAccount, transactionManager } from '@ens-apps/transaction-manager'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { sepolia } from 'viem/chains'
import { handleResult } from './utils/result'
import { uiStateReducer, initialUIState } from './reducers/uiState.reducer'
import { startRenewalTransaction } from './helpers/renewal.helpers'
import { startFundingTransaction } from './helpers/funding.helpers'

const YEAR_IN_SECONDS = 31536000n

// Rhinestone configuration (static)
const rhinestoneConfig = {
  chain: sepolia,
  rhinestoneApiKey: import.meta.env.VITE_RHINESTONE_API_KEY,
}

// Helper: Derive loading state from wallet connection status
function getLoadingState(params: {
  isConnected: boolean
  publicClient: any
  walletClient: any
}) {
  return match(params)
    .with({ isConnected: false }, () => ({
      message: 'Please connect your wallet to continue',
      background: '#fee',
      canRender: false,
    }))
    .with({ isConnected: true, publicClient: P.nullish }, () => ({
      message: '⏳ Loading public client...',
      background: '#fff3e0',
      canRender: false,
    }))
    .with({ isConnected: true, walletClient: P.nullish }, () => ({
      message: '⏳ Loading wallet client...',
      background: '#fff3e0',
      canRender: false,
    }))
    .otherwise(() => ({
      message: '',
      background: '',
      canRender: true,
    }))
}

// Hook: Fetch ENS renewal price when name or duration changes
function useRenewalPrice(params: {
  name: string
  duration: string
  publicClient: any
  dispatch: React.Dispatch<any>
}) {
  const { name, duration, publicClient, dispatch } = params

  useEffect(() => {
    let cancelled = false

    const fetchPrice = async () => {
      if (name && duration && publicClient) {
        if (!cancelled) {
          dispatch({ type: 'SET_LOADING_PRICE', payload: true })
        }

        const result = await getENSRenewalPrice(
          publicClient,
          name.replace('.eth', ''),
          BigInt(duration) * YEAR_IN_SECONDS
        )

        if (!cancelled) {
          handleResult(result, {
            onOk: (price: bigint) => dispatch({ type: 'SET_RENEWAL_PRICE', payload: price }),
            onErr: (error: Error) => console.error('Failed to get price:', error),
          })

          dispatch({ type: 'SET_LOADING_PRICE', payload: false })
        }
      }
    }
    fetchPrice()

    return () => {
      cancelled = true
    }
  }, [name, duration, publicClient, dispatch])
}

// Hook: Initialize Rhinestone account when smart account is enabled
function useRhinestoneAccountInit(params: {
  useSmartAccount: boolean
  walletClient: any
  rhinestoneAccount: any
  isInitializingAccount: boolean
  setRhinestoneAccount: (account: any) => void
  setIsInitializingAccount: (loading: boolean) => void
  setAccountError: (error: Error | undefined) => void
}) {
  const {
    useSmartAccount,
    walletClient,
    rhinestoneAccount,
    isInitializingAccount,
    setRhinestoneAccount,
    setIsInitializingAccount,
    setAccountError,
  } = params

  useEffect(() => {
    if (useSmartAccount && walletClient && !rhinestoneAccount && !isInitializingAccount) {
      console.log('🔐 [EXAMPLE] Initializing Rhinestone account...')
      setIsInitializingAccount(true)
      setAccountError(undefined)

      initializeRhinestoneAccount(walletClient, rhinestoneConfig)
        .then((result) => {
          if (result.isOk()) {
            console.log('✅ [EXAMPLE] Rhinestone account initialized:', result.value.getAddress?.())
            setRhinestoneAccount(result.value)
          } else {
            console.error('❌ [EXAMPLE] Failed to initialize Rhinestone account:', result.error)
            setAccountError(result.error as Error)
          }
        })
        .finally(() => {
          setIsInitializingAccount(false)
        })
    }
  }, [
    useSmartAccount,
    walletClient,
    rhinestoneAccount,
    isInitializingAccount,
    setRhinestoneAccount,
    setIsInitializingAccount,
    setAccountError,
  ])
}

// Hook: Update smart account address in UI when rhinestone account changes
function useSmartAccountAddress(params: {
  rhinestoneAccount: any
  dispatch: React.Dispatch<any>
}) {
  const { rhinestoneAccount, dispatch } = params

  useEffect(() => {
    if (rhinestoneAccount) {
      const address = rhinestoneAccount.getAddress?.()
      console.log('🔐 [EXAMPLE] Rhinestone account address:', address)
      dispatch({ type: 'SET_SMART_ACCOUNT_ADDRESS', payload: address })
    } else {
      dispatch({ type: 'SET_SMART_ACCOUNT_ADDRESS', payload: null })
    }
  }, [rhinestoneAccount, dispatch])
}

// Hook: Clear smart account when wallet changes
function useClearAccountOnWalletChange(params: {
  walletAddress: string | undefined
  setRhinestoneAccount: (account: any) => void
  setAccountError: (error: Error | undefined) => void
  dispatch: React.Dispatch<any>
}) {
  const { walletAddress, setRhinestoneAccount, setAccountError, dispatch } = params

  useEffect(() => {
    setRhinestoneAccount(undefined)
    setAccountError(undefined)
    dispatch({ type: 'CLEAR_SMART_ACCOUNT' })
  }, [walletAddress, setRhinestoneAccount, setAccountError, dispatch])
}

// Hook: Fetch and poll smart account balance
function useSmartAccountBalance(params: {
  smartAccountAddress: string | null
  publicClient: any
  dispatch: React.Dispatch<any>
}) {
  const { smartAccountAddress, publicClient, dispatch } = params

  useEffect(() => {
    const fetchBalance = async () => {
      if (smartAccountAddress && publicClient) {
        try {
          const balance = await publicClient.getBalance({
            address: smartAccountAddress as `0x${string}`,
          })
          dispatch({ type: 'SET_SMART_ACCOUNT_BALANCE', payload: balance })
        } catch (error) {
          console.error('Failed to fetch smart account balance:', error)
        }
      } else {
        dispatch({ type: 'SET_SMART_ACCOUNT_BALANCE', payload: null })
      }
    }

    fetchBalance()
    // Poll balance every 5 seconds when smart account is active
    const interval = smartAccountAddress ? setInterval(fetchBalance, 5000) : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [smartAccountAddress, publicClient, dispatch])
}

function ENSRenewalExample() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { data: walletClient } = useWalletClient()

  // Manage Rhinestone account locally (not through transaction manager)
  const [rhinestoneAccount, setRhinestoneAccount] = useState<any>(undefined)
  const [isInitializingAccount, setIsInitializingAccount] = useState(false)
  const [accountError, setAccountError] = useState<Error | undefined>(undefined)

  // Track the current transaction ID (just store the ID, not the actor!)
  const [currentTxId, setCurrentTxId] = useState<string | null>(null)

  // Get the actor whenever we need it (no stale references!)
  const currentTxActor = currentTxId ? transactionManager.getTransaction(currentTxId) : null

  // Subscribe to transaction state using XState's useSelector
  const txState = useSelector(currentTxActor, (snapshot) =>
    snapshot ? snapshot.value : null
  )
  const txHash = useSelector(currentTxActor, (snapshot) =>
    snapshot?.context.hash || null
  )
  const txError = useSelector(currentTxActor, (snapshot) =>
    snapshot?.context.error || null
  )

  // UI state
  const [ui, dispatch] = useReducer(uiStateReducer, initialUIState)

  // Derive loading state using helper function
  const loadingState = getLoadingState({ isConnected, publicClient, walletClient })

  // Simple button state - global components handle transaction state
  const buttonDisabled = !ui.name || ui.isLoadingPrice

  // Configure publicClient in transaction manager (optional - makes calls less verbose)
  useEffect(() => {
    if (publicClient) {
      transactionManager.setPublicClient(sepolia.id, publicClient)
    }
  }, [publicClient])

  // Custom hooks - Extract all useEffect logic
  useRenewalPrice({ name: ui.name, duration: ui.duration, publicClient, dispatch })
  useRhinestoneAccountInit({
    useSmartAccount: ui.useSmartAccount,
    walletClient,
    rhinestoneAccount,
    isInitializingAccount,
    setRhinestoneAccount,
    setIsInitializingAccount,
    setAccountError,
  })
  useSmartAccountAddress({ rhinestoneAccount, dispatch })
  useClearAccountOnWalletChange({
    walletAddress: walletClient?.account?.address,
    setRhinestoneAccount,
    setAccountError,
    dispatch,
  })
  useSmartAccountBalance({ smartAccountAddress: ui.smartAccountAddress, publicClient, dispatch })



  // Wait for clients to be ready before rendering
  if (!loadingState.canRender) {
    return (
      <div
        style={{
          padding: '40px',
          maxWidth: '600px',
          margin: '0 auto',
          fontFamily: 'system-ui',
        }}
      >
        <h1>🔧 ENS Renewal with Rhinestone</h1>
        <div
          style={{
            padding: '20px',
            background: loadingState.background,
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <p>{loadingState.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '40px',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: 'system-ui',
      }}
    >
      <h1>🔧 ENS Renewal with Rhinestone</h1>

      {match({ isConnected })
        .with({ isConnected: false }, () => (
          <div
            style={{
              padding: '20px',
              background: '#fee',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <p>Please connect your wallet to continue</p>
          </div>
        ))
        .with({ isConnected: true }, () => (
          <>
          <div
            style={{
              padding: '20px',
              background: '#f0f0f0',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <p>
              <strong>Connected:</strong> {address}
            </p>
            <p>
              <strong>Network:</strong> Sepolia Testnet
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>ENS Name to Renew:</label>
            <input
              type="text"
              value={ui.name}
              onChange={(e) => dispatch({ type: 'SET_NAME', payload: e.target.value })}
              placeholder="myname.eth"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>Duration (years):</label>
            <select
              value={ui.duration}
              onChange={(e) => dispatch({ type: 'SET_DURATION', payload: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            >
              <option value="1">1 year</option>
              <option value="2">2 years</option>
              <option value="3">3 years</option>
              <option value="5">5 years</option>
            </select>
          </div>

          {match({ renewalPrice: ui.renewalPrice })
            .with({ renewalPrice: P.not(P.nullish) }, ({ renewalPrice }) => (
              <div
                style={{
                  padding: '15px',
                  background: '#e3f2fd',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <p>
                  <strong>Renewal Cost:</strong> {formatEther(renewalPrice!)} ETH
                  {match({ useSmartAccount: ui.useSmartAccount })
                    .with({ useSmartAccount: true }, () => ' (+ gas will be sponsored)')
                    .otherwise(() => '')}
                </p>
              </div>
            ))
            .otherwise(() => null)}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                checked={ui.useSmartAccount}
                onChange={(e) =>
                  dispatch({ type: 'SET_USE_SMART_ACCOUNT', payload: e.target.checked })
                }
              />
              <span>
                Use Rhinestone Smart Account
                {match({ useSmartAccount: ui.useSmartAccount })
                  .with({ useSmartAccount: true }, () => ' (ERC-7579 compatible)')
                  .otherwise(() => '')}
              </span>
            </label>
          </div>

          {match({ useSmartAccount: ui.useSmartAccount, smartAccountAddress: ui.smartAccountAddress })
            .with({ useSmartAccount: true, smartAccountAddress: P.not(P.nullish) }, ({ smartAccountAddress }) => (
              <div
                style={{
                  padding: '15px',
                  background: '#fff3e0',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  border: '1px solid #ffb74d',
                }}
              >
                <p>
                  <strong>🔐 Smart Account Address:</strong>
                </p>
                <p
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    wordBreak: 'break-all',
                    background: '#fff',
                    padding: '8px',
                    borderRadius: '4px',
                    margin: '10px 0',
                  }}
                >
                  {smartAccountAddress}
                </p>

                <p style={{ marginTop: '10px' }}>
                  <strong>Balance:</strong>{' '}
                  {match({ smartAccountBalance: ui.smartAccountBalance })
                    .with({ smartAccountBalance: P.not(P.nullish) }, ({ smartAccountBalance }) => `${formatEther(smartAccountBalance!)} ETH`)
                    .otherwise(() => 'Loading...')}
                </p>

                {accountError && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '10px',
                      background: '#ffebee',
                      border: '1px solid #f44336',
                      borderRadius: '4px',
                      color: '#c62828',
                    }}
                  >
                    <strong>❌ Error:</strong> {accountError.message}
                  </div>
                )}

                <div
                  style={{
                    marginTop: '15px',
                    padding: '15px',
                    background: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                  }}
                >
                  <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>💰 Fund Smart Account</p>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={ui.fundingAmount}
                      onChange={(e) => dispatch({ type: 'SET_FUNDING_AMOUNT', payload: e.target.value })}
                      placeholder="0.5"
                      step="0.01"
                      min="0"
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                    <span>ETH</span>
                    <button
                      onClick={async () => {
                        const result = await startFundingTransaction(
                          {
                            smartAccountAddress: ui.smartAccountAddress!,
                            amount: ui.fundingAmount,
                          },
                          { walletClient }
                        )

                        if (result.error) {
                          alert(result.error)
                        } else if (result.txId) {
                          console.log('🚀 Started funding transaction:', result.txId)
                          setCurrentTxId(result.txId)
                        }
                      }}
                      disabled={!ui.fundingAmount}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        background: !ui.fundingAmount ? '#ccc' : '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: !ui.fundingAmount ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Send ETH
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                    Send ETH from your connected wallet to fund this smart account
                  </p>
                </div>

                <p style={{ fontSize: '14px', marginTop: '15px' }}>
                  <strong>💡 Tip:</strong> Alternatively, uncomment the <code>paymasterUrl</code> in
                  the code for gasless transactions
                </p>
              </div>
            ))
            .otherwise(() => null)}

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={async () => {
                const result = await startRenewalTransaction(
                  {
                    name: ui.name,
                    duration: ui.duration,
                    renewalPrice: ui.renewalPrice,
                  },
                  ui.useSmartAccount
                    ? {
                        type: 'rhinestone',
                        rhinestoneAccount,
                        rhinestoneConfig,
                        publicClient: publicClient!,
                        chainId: sepolia.id,
                      }
                    : {
                        type: 'eoa',
                        walletClient: walletClient!,
                        publicClient: publicClient!,
                        chainId: sepolia.id,
                      }
                )

                if (result.error) {
                  alert(result.error)
                } else if (result.txId) {
                  console.log('🚀 Started renewal transaction:', result.txId)
                  setCurrentTxId(result.txId)
                }
              }}
              disabled={buttonDisabled}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                background: buttonDisabled ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              Renew {ui.name || 'Name'}
            </button>
          </div>

          {/* Transaction status (no context needed - using useSelector!) */}
          {txState && (
            <div
              style={{
                padding: '15px',
                background: match(txState)
                  .with('submitting', () => '#fff3e0')
                  .with('pending', () => '#e3f2fd')
                  .with('success', () => '#e8f5e9')
                  .with('error', () => '#ffebee')
                  .otherwise(() => '#f5f5f5'),
                borderRadius: '8px',
                marginTop: '20px',
                border: '1px solid',
                borderColor: match(txState)
                  .with('submitting', () => '#ffb74d')
                  .with('pending', () => '#64b5f6')
                  .with('success', () => '#81c784')
                  .with('error', () => '#e57373')
                  .otherwise(() => '#e0e0e0'),
              }}
            >
              <p style={{ margin: 0, fontWeight: 'bold' }}>
                {match(txState)
                  .with('submitting', () => '⏳ Submitting Transaction...')
                  .with('pending', () => '⏱️ Transaction Pending')
                  .with('success', () => '✅ Transaction Successful!')
                  .with('error', () => '❌ Transaction Failed')
                  .otherwise(() => `Status: ${txState}`)}
              </p>

              {txHash && (
                <p style={{ margin: '10px 0 0 0', fontSize: '14px', wordBreak: 'break-all' }}>
                  <strong>Hash:</strong>{' '}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1976d2' }}
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                </p>
              )}

              {txError && (
                <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#c62828' }}>
                  <strong>Error:</strong> {txError.message || String(txError)}
                </p>
              )}

              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                Also check the status panel in the bottom-right for global view →
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: '40px',
              padding: '20px',
              background: '#f5f5f5',
              borderRadius: '8px',
            }}
          >
            <h3>How it works:</h3>
            <ol style={{ lineHeight: '1.8' }}>
              <li>Enter the ENS name you want to renew</li>
              <li>Select the renewal duration (1-5 years)</li>
              <li>
                Choose whether to use a Rhinestone Smart Account:
                <ul>
                  <li>
                    <strong>Smart Account:</strong> Uses ERC-7579 modular account, can enable
                    gasless transactions
                  </li>
                  <li>
                    <strong>Regular EOA:</strong> Standard wallet transaction
                  </li>
                </ul>
              </li>
              <li>Click "Renew" to submit the transaction</li>
              <li>
                The transaction manager will handle the renewal process with automatic retry and
                fallback mechanisms. Try refreshing the page - your transaction will be recovered!
              </li>
            </ol>
          </div>

          <div
            style={{
              marginTop: '20px',
              padding: '15px',
              background: '#fffde7',
              borderRadius: '8px',
              border: '1px solid #f0f4c3',
            }}
          >
            <p>
              <strong>Note:</strong> This example works on Sepolia testnet. Make sure you have:
            </p>
            <ul style={{ marginTop: '10px' }}>
              <li>Sepolia ETH for gas fees (or smart account balance if using smart account)</li>
              <li>An ENS name registered on Sepolia to renew</li>
              <li>
                A Rhinestone API key for smart account functionality - add to{' '}
                <code>.env</code> as <code>VITE_RHINESTONE_API_KEY</code>
              </li>
            </ul>
          </div>
        </>
        ))
        .exhaustive()}

    </div>
  )
}

export default ENSRenewalExample
