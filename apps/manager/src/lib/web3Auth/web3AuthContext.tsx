import { WEB3AUTH_NETWORK } from '@web3auth/modal'
import type { Web3AuthContextConfig } from '@web3auth/modal/react'
import { namechainChain } from '../chains'

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID

if (!clientId) {
  throw new Error('VITE_WEB3AUTH_CLIENT_ID environment variable is required')
}

const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Must match your client ID configuration
    // Only include your local chain
    chains: [namechainChain],
    defaultChainId: namechainChain.chainId,
    // Additional configuration for localhost
    // uiConfig: {
    //   appName: 'ENS Manager Local',
    //   mode: 'light',
    //   loginMethodsOrder: ['email_passwordless', 'google', 'github'],
    //   logoLight: 'https://web3auth.io/images/web3authlog.png',
    //   logoDark: 'https://web3auth.io/images/web3authlogodark.png',
    //   defaultLanguage: 'en',
    //   modalZIndex: '99999',
    // },
    // No accountAbstractionConfig - we'll use custom implementation
    // Web3Auth's built-in AA doesn't support local chains
  },
}

export default web3AuthContextConfig
