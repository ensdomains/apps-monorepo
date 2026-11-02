/** Renewals pay with USDC on Ethereum only; the testnet build's token isn't mainnet USDC, so it keeps the plain heading. */
export const getPaymentHeading = (
  mode: 'register' | 'renew' | undefined,
  isSepolia: boolean,
): string =>
  mode === 'renew' && !isSepolia
    ? 'Select payment method (Mainnet USDC)'
    : 'Select payment method'
