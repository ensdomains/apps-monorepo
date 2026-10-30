import type { Connector } from 'wagmi'

/** A Safe{Wallet} over WalletConnect: `checkIsSafeWallet` reads only `type` and the session peer. */
export const SAFE_WALLET_CONNECTOR = {
  type: 'walletConnect',
  getProvider: async () => ({
    session: {
      peer: {
        metadata: { name: 'Safe{Wallet}', url: 'https://app.safe.global' },
      },
    },
  }),
} as unknown as Connector
