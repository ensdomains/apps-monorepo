import { QueryClient } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  quote: vi.fn(),
  balance: vi.fn(),
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: {
    readContract: mocks.balance,
    getBalance: () => Promise.resolve(1n),
  },
}))
vi.mock('@ens-apps/transaction-manager', () => ({
  quoteEthPaymentActor: mocks.quote,
  quoteEthSwapGasReserve: () => okAsync(0n),
  readEthUsdPrice: () => okAsync(1n),
}))

import { getEthPaymentQuoteQueryOptions } from './ethPaymentQuote.query'

it('quotes only the USDC missing from the renewal wallet', async () => {
  mocks.balance.mockResolvedValue(3n)
  mocks.quote.mockReturnValue(okAsync({ usdcToBuy: 7n }))
  const options = getEthPaymentQuoteQueryOptions({
    owner: '0x1111111111111111111111111111111111111111',
    receiver: '0x1111111111111111111111111111111111111111',
    sellToken: {
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      symbol: 'ETH',
      decimals: 18,
      isNative: true,
    },
    fundingMode: 'topUp',
    permitValue: 10n,
    isEnabled: true,
  })
  if (typeof options.queryFn !== 'function') throw new Error('Missing query')
  await options.queryFn({
    client: new QueryClient(),
    queryKey: options.queryKey,
    signal: new AbortController().signal,
    meta: undefined,
  })
  expect(mocks.quote).toHaveBeenCalledWith(
    expect.objectContaining({ permitValue: 7n }),
  )
})
