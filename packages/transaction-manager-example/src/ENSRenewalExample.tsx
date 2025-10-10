import React, { useReducer, useEffect } from 'react'
import { useMachine } from '@xstate/react'
import { match, P } from 'ts-pattern'
import { formatEther, parseEther } from 'viem'
import {
  transactionMachine,
  TransactionService,
  TransactionModal,
  prepareENSRenewal,
  getENSRenewalPrice,
  getRhinestoneSmartAccountAddress,
} from '@ens-apps/transaction-manager'
import { useAccount, usePublicClient, useWalletClient, useSendTransaction } from 'wagmi'
import { sepolia } from 'viem/chains'
import { handleResult } from './utils/result'
import { uiStateReducer, initialUIState } from './reducers/uiState.reducer'

const YEAR_IN_SECONDS = 31536000n

function ENSRenewalExample() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { data: walletClient } = useWalletClient()
  const { sendTransaction } = useSendTransaction()

  // Rhinestone config
  const rhinestoneConfig = {
    chain: sepolia,
    rhinestoneApiKey: import.meta.env.VITE_RHINESTONE_API_KEY,
  }

  // UI state
  const [ui, dispatch] = useReducer(uiStateReducer, initialUIState)

  // Transaction state machine
  const [state, send] = useMachine(transactionMachine, {
    input: {
      transactionService: new TransactionService(publicClient!, walletClient),
    },
  })

  // Derive UI state from machine state using ts-pattern
  const machineState = state.value.toString()
  const transactionUI = match(state.value)
    .with('idle', () => ({
      buttonText: `Renew ${ui.name || 'Name'}`,
      buttonDisabled: !ui.name || ui.isLoadingPrice,
      buttonColor: '#4CAF50',
      showStatus: false,
      statusBackground: '',
      statusMessage: null,
    }))
    .with('preparing', 'submitting', () => ({
      buttonText: 'Preparing...',
      buttonDisabled: true,
      buttonColor: '#ccc',
      showStatus: true,
      statusBackground: '#fff3e0',
      statusMessage: 'Preparing transaction...',
    }))
    .with('pending', 'confirming', 'checkingFallback', () => ({
      buttonText: 'Confirming...',
      buttonDisabled: true,
      buttonColor: '#ccc',
      showStatus: true,
      statusBackground: '#fff3e0',
      statusMessage: 'Waiting for confirmation...',
    }))
    .with('success', () => ({
      buttonText: 'Renew Again',
      buttonDisabled: false,
      buttonColor: '#4CAF50',
      showStatus: true,
      statusBackground: '#e8f5e9',
      statusMessage: '✅ Renewal successful! Your name has been extended.',
    }))
    .with(P.string.startsWith('error'), () => ({
      buttonText: 'Retry',
      buttonDisabled: false,
      buttonColor: '#f44336',
      showStatus: true,
      statusBackground: '#ffebee',
      statusMessage: `❌ Error: ${state.context.error?.message || 'Unknown error'}`,
    }))
    .exhaustive()

  const hash = state.context.hash

  // Update modal data when renewal price changes
  useEffect(() => {
    if (ui.renewalPrice) {
      send({
        type: 'UPDATE_MODAL_DATA',
        data: {
          estimatedCost: `${formatEther(ui.renewalPrice)} ETH`
        }
      })
    }
  }, [ui.renewalPrice, send])

  // Fetch renewal price when name or duration changes
  useEffect(() => {
    const fetchPrice = async () => {
      if (ui.name && ui.duration && publicClient) {
        dispatch({ type: 'SET_LOADING_PRICE', payload: true })
        const result = await getENSRenewalPrice(
          publicClient,
          ui.name.replace('.eth', ''),
          BigInt(ui.duration) * YEAR_IN_SECONDS
        )

        // Handle Result type with helper
        handleResult(result, {
          onOk: (price: bigint) => dispatch({ type: 'SET_RENEWAL_PRICE', payload: price }),
          onErr: (error: Error) => console.error('Failed to get price:', error),
        })

        dispatch({ type: 'SET_LOADING_PRICE', payload: false })
      }
    }
    fetchPrice()
  }, [ui.name, ui.duration, publicClient])

  // Fetch smart account address when smart account is enabled
  useEffect(() => {
    const fetchAddress = async () => {
      if (ui.useSmartAccount && publicClient && walletClient && isConnected) {
        const result = await getRhinestoneSmartAccountAddress(
          publicClient,
          walletClient,
          rhinestoneConfig
        )

        // Handle Result type with helper
        handleResult(result, {
          onOk: (address: string) => dispatch({ type: 'SET_SMART_ACCOUNT_ADDRESS', payload: address }),
          onErr: (error: Error) => console.error('Failed to get smart account:', error),
        })
      } else {
        dispatch({ type: 'SET_SMART_ACCOUNT_ADDRESS', payload: null })
      }
    }
    fetchAddress()
  }, [ui.useSmartAccount, publicClient, walletClient, isConnected])

  // Clear smart account when wallet changes
  useEffect(() => {
    dispatch({ type: 'CLEAR_SMART_ACCOUNT' })
  }, [walletClient?.account?.address])

  // Fetch smart account balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (ui.smartAccountAddress && publicClient) {
        try {
          const balance = await publicClient.getBalance({
            address: ui.smartAccountAddress as `0x${string}`,
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
    const interval = ui.smartAccountAddress ? setInterval(fetchBalance, 5000) : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [ui.smartAccountAddress, publicClient])

  const handleRenew = async () => {
    if (!ui.name) {
      alert('Please enter a name to renew')
      return
    }

    if (!publicClient || !walletClient) {
      console.error('Missing clients')
      return
    }

    const cleanName = ui.name.replace('.eth', '')
    const durationInSeconds = BigInt(ui.duration) * YEAR_IN_SECONDS

    console.log('Starting transaction, current state:', machineState)

    // Prepare ENS renewal using helper
    const result = await prepareENSRenewal({
      publicClient,
      walletClient,
      name: cleanName,
      duration: durationInSeconds,
      chainId: sepolia.id,
      useSmartAccount: ui.useSmartAccount,
      rhinestoneConfig: ui.useSmartAccount ? rhinestoneConfig : undefined,
    })

    // Handle Result type with helper
    handleResult(result, {
      onOk: (data: { request: any; options: any }) => {
        // Execute via transaction machine with modal data
        send({
          type: 'EXECUTE',
          request: data.request,
          options: {
            ...data.options,
            description: `Renew ${cleanName}.eth for ${ui.duration} year(s)`,
          },
          modal: {
            title: `Renew ${ui.name}`,
            ensName: ui.name,
            network: 'Sepolia',
            estimatedCost: ui.renewalPrice ? `${formatEther(ui.renewalPrice)} ETH` : '0.0011 ETH',
          }
        })
      },
      onErr: (error: Error) => {
        console.error('Failed to prepare renewal:', error)
        alert(`Failed to prepare transaction: ${error.message}`)
      },
    })
  }

  // Debug: Log state changes
  useEffect(() => {
    console.log('Transaction state changed to:', machineState)
  }, [machineState])

  const handleFundSmartAccount = async () => {
    if (!ui.smartAccountAddress) {
      alert('Smart account address not available')
      return
    }

    try {
      const amount = parseFloat(ui.fundingAmount)
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount')
        return
      }

      dispatch({ type: 'SET_FUNDING', payload: true })

      sendTransaction({
        to: ui.smartAccountAddress as `0x${string}`,
        value: parseEther(ui.fundingAmount),
      })

      // Wait a bit for the transaction to be mined, then refresh balance
      setTimeout(() => {
        dispatch({ type: 'SET_FUNDING', payload: false })
      }, 2000)
    } catch (error) {
      console.error('Failed to fund smart account:', error)
      alert('Failed to send transaction')
      dispatch({ type: 'SET_FUNDING', payload: false })
    }
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

      {!isConnected ? (
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
      ) : (
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

          {ui.renewalPrice && (
            <div
              style={{
                padding: '15px',
                background: '#e3f2fd',
                borderRadius: '8px',
                marginBottom: '20px',
              }}
            >
              <p>
                <strong>Renewal Cost:</strong> {formatEther(ui.renewalPrice)} ETH
                {ui.useSmartAccount && ' (+ gas will be sponsored)'}
              </p>
            </div>
          )}

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
                {ui.useSmartAccount && ' (ERC-7579 compatible)'}
              </span>
            </label>
          </div>

          {ui.useSmartAccount && ui.smartAccountAddress && (
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
                {ui.smartAccountAddress}
              </p>

              <p style={{ marginTop: '10px' }}>
                <strong>Balance:</strong>{' '}
                {ui.smartAccountBalance !== null
                  ? `${formatEther(ui.smartAccountBalance)} ETH`
                  : 'Loading...'}
              </p>

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
                    onClick={handleFundSmartAccount}
                    disabled={ui.isFunding || !ui.fundingAmount}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      background: ui.isFunding ? '#ccc' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: ui.isFunding ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ui.isFunding ? 'Sending...' : 'Send ETH'}
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
          )}

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={handleRenew}
              disabled={transactionUI.buttonDisabled}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                background: transactionUI.buttonColor,
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: transactionUI.buttonDisabled ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              {transactionUI.buttonText}
            </button>
          </div>

          {/* Transaction Status - using ts-pattern for conditional rendering */}
          {transactionUI.showStatus && (
            <div
              style={{
                padding: '20px',
                background: transactionUI.statusBackground,
                borderRadius: '8px',
                marginTop: '20px',
              }}
            >
              <h3>Transaction Status</h3>
              <p>
                <strong>State:</strong> {machineState}
              </p>

              {hash && (
                <p>
                  <strong>Transaction Hash:</strong>{' '}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2196F3', wordBreak: 'break-all' }}
                  >
                    {hash}
                  </a>
                </p>
              )}

              {transactionUI.statusMessage && <p>{transactionUI.statusMessage}</p>}
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
                fallback mechanisms
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
              <li>
                (Optional) A Pimlico API key for gasless transactions - add to{' '}
                <code>.env</code> as <code>VITE_PIMLICO_API_KEY</code>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* Transaction Modal */}
      <TransactionModal
        {...state.context.modal}
        machineState={machineState}
        onClose={() => send({ type: 'CLOSE_MODAL' })}
        onDone={() => send({ type: 'CLOSE_MODAL' })}
      />
    </div>
  )
}

export default ENSRenewalExample
