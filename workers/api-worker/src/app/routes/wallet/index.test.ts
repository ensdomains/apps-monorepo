import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { describe, expect, it } from 'vitest'
import walletApp from './index'

describe('GET /wallet/tokens', () => {
  it('returns the faucet stablecoin addresses, decimals, and chain id', async () => {
    const res = await walletApp.request('/wallet/tokens', undefined, {
      CHAIN: 'sepolia',
    } as CloudflareBindings)

    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      chainId: number
      tokens: Record<
        string,
        { address: string; decimals: number; symbol: string }
      >
    }

    const sepoliaContracts = ensL1Contracts[supportedL1Chains.sepolia]

    expect(body.chainId).toBe(11155111)
    // Source of truth: the addresses must equal what /fund mints (ensjs config),
    // so the manager reads balances against exactly the minted tokens.
    expect(body.tokens.USDC).toEqual({
      address: sepoliaContracts.usdc.address,
      decimals: 6,
      symbol: 'USDC',
    })
    expect(body.tokens.DAI).toEqual({
      address: sepoliaContracts.dai.address,
      decimals: 18,
      symbol: 'DAI',
    })
  })
})

describe('Sepolia-only wallet routes', () => {
  it.each(['mainnet', 'unknown', undefined])(
    'rejects funding and mock token metadata when CHAIN is %s',
    async (chain) => {
      // Only CHAIN is available: accessing any infrastructure or key fails
      // the test, even if Sepolia credentials were accidentally provisioned.
      const env = new Proxy(
        { CHAIN: chain },
        {
          get(target, property) {
            if (property === 'CHAIN') return target.CHAIN
            throw new Error(`Unexpected binding access: ${String(property)}`)
          },
        },
      ) as CloudflareBindings

      const tokens = await walletApp.request('/wallet/tokens', undefined, env)
      const fund = await walletApp.request(
        '/wallet/fund',
        { method: 'POST' },
        env,
      )

      expect(tokens.status).toBe(404)
      expect(fund.status).toBe(404)
      expect(await fund.text()).toBe(
        'Wallet faucet is only available on Sepolia',
      )
    },
  )
})
