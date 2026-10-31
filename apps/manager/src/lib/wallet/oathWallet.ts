// Oath is a native iOS wallet. Its list entry uses the existing WalletConnect
// connector, so signing, chain switching and reconnect keep the native path.
export const OATH_WALLET = {
  id: 'oath-wallet',
  name: 'Oath Wallet',
  icon: '/oath-wallet.svg',
  walletConnectId:
    '79f336977e239d92625bdecf3f2e20a2d8f9974b5fa884d23ec02c9b82e075ce',
} as const
