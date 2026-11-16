// MetaMask rejects a `wallet_sendCalls` bundle of more than 10 calls (EIP-5792
// error 5740), and EIP-5792 has no capability to discover the limit.
export const MAX_WALLET_BUNDLE_CALLS = 10

/** Splits items into consecutive groups a wallet accepts as one bundle each. */
export const chunkWalletBundle = <T>(
  items: readonly T[],
): readonly (readonly T[])[] =>
  Array.from(
    { length: Math.ceil(items.length / MAX_WALLET_BUNDLE_CALLS) },
    (_, index) =>
      items.slice(
        index * MAX_WALLET_BUNDLE_CALLS,
        (index + 1) * MAX_WALLET_BUNDLE_CALLS,
      ),
  )
