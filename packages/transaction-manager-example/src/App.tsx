import React from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit'
import { config } from './wagmi-config'
import ENSRenewalExample from './ENSRenewalExample'
import { AuditTrailDashboard } from './examples/AuditTrailDashboard'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(to bottom, #f0f9ff, #e0f2fe)'
          }}>
            <header style={{
              padding: '20px',
              background: 'white',
              borderBottom: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ margin: 0, color: '#1e293b' }}>
                  ENS Transaction Manager
                </h2>
                <ConnectButton />
              </div>
            </header>

            <main style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              paddingBottom: '40px'
            }}>
              <ENSRenewalExample />
              <div style={{
                padding: '40px',
                maxWidth: '1200px',
                margin: '0 auto',
                width: '100%'
              }}>
                <AuditTrailDashboard />
              </div>
            </main>
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App