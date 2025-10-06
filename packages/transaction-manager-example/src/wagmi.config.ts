import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  mainnet,
  sepolia,
  localhost
} from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'ENS Transaction Manager Example',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Get from https://cloud.walletconnect.com
  chains: [mainnet, sepolia, localhost],
  ssr: false
})