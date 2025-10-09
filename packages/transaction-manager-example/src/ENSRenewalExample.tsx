import React, { useState, useEffect } from 'react'
import { formatEther, parseEther } from 'viem'
import { useENSRenewal, TransactionModal, useTransactionModal } from '@ens-apps/transaction-manager'
import { useAccount, usePublicClient, useSendTransaction } from 'wagmi'
import { sepolia } from 'viem/chains'

const YEAR_IN_SECONDS = 31536000n

function ENSRenewalExample() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { sendTransaction } = useSendTransaction()

  const [name, setName] = useState('leon.eth')
  const [duration, setDuration] = useState('1') // years
  const [useSmartAccount, setUseSmartAccount] = useState(true)
  const [renewalPrice, setRenewalPrice] = useState<bigint | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null)
  const [smartAccountBalance, setSmartAccountBalance] = useState<bigint | null>(null)
  const [fundingAmount, setFundingAmount] = useState('0.5')
  const [isFunding, setIsFunding] = useState(false)

  const {
    renewName,
    getRenewalPrice,
    getSmartAccountAddress,
    state,
    isLoading,
    isPending,
    isSuccess,
    isError,
    hash,
    error,
    debugReport,
  } = useENSRenewal({
    useSmartAccount,
    // Add your Pimlico API key here or in .env
    bundlerUrl: `https://api.pimlico.io/v2/sepolia/rpc?apikey=${
      import.meta.env.VITE_PIMLICO_API_KEY || 'YOUR_API_KEY'
    }`,
    // Optional: Add paymaster for gasless transactions
    // paymasterUrl: `https://api.pimlico.io/v2/sepolia/rpc?apikey=${import.meta.env.VITE_PIMLICO_API_KEY}`,
  })

  // Transaction Modal
  const modal = useTransactionModal({
    ensName: name || 'domico.eth',
    network: 'Sepolia',
    estimatedCost: renewalPrice ? `${formatEther(renewalPrice)} ETH` : '0.0011 ETH',
  })

  // Sync transaction state with modal - update estimated cost when renewal price changes
  useEffect(() => {
    if (renewalPrice) {
      modal.setEstimatedCost(`${formatEther(renewalPrice)} ETH`)
    }
  }, [renewalPrice, modal.setEstimatedCost])

  // Fetch renewal price when name or duration changes
  useEffect(() => {
    const fetchPrice = async () => {
      if (name && duration) {
        setIsLoadingPrice(true)
        const price = await getRenewalPrice(
          name.replace('.eth', ''),
          BigInt(duration) * YEAR_IN_SECONDS
        )
        setRenewalPrice(price)
        setIsLoadingPrice(false)
      }
    }
    fetchPrice()
  }, [name, duration, getRenewalPrice])

  // Fetch smart account address when smart account is enabled
  useEffect(() => {
    const fetchAddress = async () => {
      if (useSmartAccount && getSmartAccountAddress && isConnected) {
        const addr = await getSmartAccountAddress()
        setSmartAccountAddress(addr)
      } else {
        setSmartAccountAddress(null)
      }
    }
    fetchAddress()
  }, [useSmartAccount, getSmartAccountAddress, isConnected])

  // Fetch smart account balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (smartAccountAddress && publicClient) {
        try {
          const balance = await publicClient.getBalance({
            address: smartAccountAddress as `0x${string}`,
          })
          setSmartAccountBalance(balance)
        } catch (error) {
          console.error('Failed to fetch smart account balance:', error)
        }
      } else {
        setSmartAccountBalance(null)
      }
    }

    fetchBalance()
    // Poll balance every 5 seconds when smart account is active
    const interval = smartAccountAddress ? setInterval(fetchBalance, 5000) : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [smartAccountAddress, publicClient])

  const handleRenew = () => {
    if (!name) {
      alert('Please enter a name to renew')
      return
    }

    modal.openModal()
  }

  const handleStartTransaction = () => {
    const cleanName = name.replace('.eth', '')
    const durationInSeconds = BigInt(duration) * YEAR_IN_SECONDS

    console.log('Starting transaction, current state:', state)
    renewName(cleanName, durationInSeconds, {
      description: `Renew ${cleanName}.eth for ${duration} year(s)`,
    })
  }

  // Debug: Log state changes
  useEffect(() => {
    console.log('Transaction state changed to:', state)
  }, [state])

  const handleFundSmartAccount = async () => {
    if (!smartAccountAddress) {
      alert('Smart account address not available')
      return
    }

    try {
      const amount = parseFloat(fundingAmount)
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount')
        return
      }

      setIsFunding(true)

      sendTransaction({
        to: smartAccountAddress as `0x${string}`,
        value: parseEther(fundingAmount),
      })

      // Wait a bit for the transaction to be mined, then refresh balance
      setTimeout(() => {
        setIsFunding(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to fund smart account:', error)
      alert('Failed to send transaction')
      setIsFunding(false)
    }
  }

  const handleDebugReport = () => {
    const report = debugReport()
    if (report) {
      console.log('Debug Report:', report)
      alert('Debug report logged to console')
    }
  }

  return (
    <div style={{
      padding: '40px',
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: 'system-ui'
    }}>
      <h1>🔧 ENS Renewal with Rhinestone</h1>

      {!isConnected ? (
        <div style={{
          padding: '20px',
          background: '#fee',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <p>Please connect your wallet to continue</p>
        </div>
      ) : (
        <>
          <div style={{
            padding: '20px',
            background: '#f0f0f0',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <p><strong>Connected:</strong> {address}</p>
            <p><strong>Network:</strong> Sepolia Testnet</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>
              ENS Name to Renew:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            <label style={{ display: 'block', marginBottom: '8px' }}>
              Duration (years):
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
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

          {renewalPrice && (
            <div style={{
              padding: '15px',
              background: '#e3f2fd',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p>
                <strong>Renewal Cost:</strong>{' '}
                {formatEther(renewalPrice)} ETH
                {useSmartAccount && ' (+ gas will be sponsored)'}
              </p>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                checked={useSmartAccount}
                onChange={(e) => setUseSmartAccount(e.target.checked)}
              />
              <span>
                Use Rhinestone Smart Account
                {useSmartAccount && ' (ERC-7579 compatible)'}
              </span>
            </label>
          </div>

          {useSmartAccount && smartAccountAddress && (
            <div style={{
              padding: '15px',
              background: '#fff3e0',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #ffb74d'
            }}>
              <p><strong>🔐 Smart Account Address:</strong></p>
              <p style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                wordBreak: 'break-all',
                background: '#fff',
                padding: '8px',
                borderRadius: '4px',
                margin: '10px 0'
              }}>
                {smartAccountAddress}
              </p>

              <p style={{ marginTop: '10px' }}>
                <strong>Balance:</strong>{' '}
                {smartAccountBalance !== null
                  ? `${formatEther(smartAccountBalance)} ETH`
                  : 'Loading...'}
              </p>

              <div style={{
                marginTop: '15px',
                padding: '15px',
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                  💰 Fund Smart Account
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={fundingAmount}
                    onChange={(e) => setFundingAmount(e.target.value)}
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
                    disabled={isFunding || !fundingAmount}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      background: isFunding ? '#ccc' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isFunding ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isFunding ? 'Sending...' : 'Send ETH'}
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                  Send ETH from your connected wallet to fund this smart account
                </p>
              </div>

              <p style={{ fontSize: '14px', marginTop: '15px' }}>
                <strong>💡 Tip:</strong> Alternatively, uncomment the <code>paymasterUrl</code> in the code for gasless transactions
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={handleRenew}
              disabled={isLoading || isPending || !name || isLoadingPrice}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                background: isLoading || isPending ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading || isPending ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              {isLoading
                ? 'Preparing...'
                : isPending
                ? 'Confirming...'
                : `Renew ${name || 'Name'}`}
            </button>

            {(isSuccess || isError) && (
              <button
                onClick={handleDebugReport}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Debug Report
              </button>
            )}
          </div>

          {/* Transaction Status */}
          {state !== 'idle' && (
            <div
              style={{
                padding: '20px',
                background: isSuccess
                  ? '#e8f5e9'
                  : isError
                  ? '#ffebee'
                  : '#fff3e0',
                borderRadius: '8px',
                marginTop: '20px',
              }}
            >
              <h3>Transaction Status</h3>
              <p><strong>State:</strong> {state}</p>

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

              {isSuccess && (
                <p style={{ color: '#4CAF50' }}>
                  ✅ Renewal successful! Your name has been extended.
                </p>
              )}

              {error && (
                <p style={{ color: '#f44336' }}>
                  ❌ Error: {error.message}
                </p>
              )}
            </div>
          )}

          <div style={{
            marginTop: '40px',
            padding: '20px',
            background: '#f5f5f5',
            borderRadius: '8px'
          }}>
            <h3>How it works:</h3>
            <ol style={{ lineHeight: '1.8' }}>
              <li>Enter the ENS name you want to renew</li>
              <li>Select the renewal duration (1-5 years)</li>
              <li>
                Choose whether to use a Rhinestone Smart Account:
                <ul>
                  <li>
                    <strong>Smart Account:</strong> Uses ERC-7579 modular account,
                    can enable gasless transactions
                  </li>
                  <li>
                    <strong>Regular EOA:</strong> Standard wallet transaction
                  </li>
                </ul>
              </li>
              <li>Click "Renew" to submit the transaction</li>
              <li>
                The transaction manager will handle the renewal process with
                automatic retry and fallback mechanisms
              </li>
            </ol>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: '#fffde7',
            borderRadius: '8px',
            border: '1px solid #f0f4c3'
          }}>
            <p><strong>Note:</strong> This example works on Sepolia testnet.
            Make sure you have:</p>
            <ul style={{ marginTop: '10px' }}>
              <li>Sepolia ETH for gas fees</li>
              <li>An ENS name registered on Sepolia to renew</li>
              <li>
                (Optional) A Pimlico API key for smart account functionality -
                add to <code>.env</code> as <code>VITE_PIMLICO_API_KEY</code>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={modal.isOpen}
        title={`Renew ${name || 'Name'}`}
        ensName={name}
        network={modal.network}
        estimatedCost={modal.estimatedCost}
        machineState={state}
        onClose={modal.closeModal}
        onStart={handleStartTransaction}
        onDone={modal.closeModal}
        onRetry={handleStartTransaction}
      />
    </div>
  )
}

export default ENSRenewalExample