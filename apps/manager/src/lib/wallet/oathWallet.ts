// Oath is a native iOS wallet. Its list entry uses the existing WalletConnect
// connector, so signing, chain switching and reconnect keep the native path.
export const OATH_WALLET = {
  id: 'oath-wallet',
  name: 'Oath Wallet',
  icon: '/oath-wallet.svg',
  walletConnectId:
    '79f336977e239d92625bdecf3f2e20a2d8f9974b5fa884d23ec02c9b82e075ce',
} as const

// Pairing and cancellation stay with the existing provider. These listeners
// select Oath's native AppKit guide only for the lifetime of an Oath attempt.
export const prepareOathConnectionView = async (
  signal: AbortSignal,
): Promise<void> => {
  const { ModalController, RouterController } = await import(
    '@reown/appkit-controllers'
  )
  if (signal.aborted) return
  const showOath = () => {
    if (ModalController.state.open) {
      RouterController.reset('ConnectingWalletConnect', {
        wallet: {
          id: OATH_WALLET.walletConnectId,
          name: OATH_WALLET.name,
          image_url: OATH_WALLET.icon,
          homepage: 'https://oathwallet.org',
          mobile_link: 'oathwallet://',
          app_store: 'https://apps.apple.com/app/id6780187283',
        },
      })
    }
  }
  const unsubscribeOpen = ModalController.subscribeKey('open', (open) => {
    if (open) showOath()
  })
  const unsubscribeView = RouterController.subscribeKey('view', (view) => {
    // Reopening an already-open modal changes its route, not its open flag.
    if (view === 'ConnectingWalletConnectBasic' || view === 'AllWallets')
      showOath()
  })
  signal.addEventListener(
    'abort',
    () => {
      unsubscribeOpen()
      unsubscribeView()
    },
    { once: true },
  )
}
