import { injected, walletConnect } from '@wagmi/connectors'
import { paraConnector } from './paraConnector'

export { paraConnector }

export const metaMaskConnector = injected({
  target: 'metaMask',
})

export const walletConnectConnector = walletConnect({
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
})
