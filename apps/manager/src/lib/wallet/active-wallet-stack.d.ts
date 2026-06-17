/**
 * Virtual module resolved by a build-time Vite alias (see vite.config.ts) to
 * the selected vendor stack — RainbowKitStack (default) or PrivyStack. Static
 * import means only the chosen vendor's code is bundled and the tree renders
 * synchronously (SSR-safe). Selection is per-deployment via VITE_FF_USE_PRIVY.
 */
declare module 'active-wallet-stack' {
  const ActiveWalletStack: (props: {
    children: React.ReactNode
  }) => React.ReactNode

  export default ActiveWalletStack
}
