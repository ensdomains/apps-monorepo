import type { Signer } from '@ens-apps/transaction-manager'
import type { WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import type { Connector } from 'wagmi'
import {
  getRenewalPaymentRoute,
  resolveRenewalSigner,
} from './renewalPaymentRoute'

describe('getRenewalPaymentRoute', () => {
  it('renews a smart account by intent', () => {
    expect(getRenewalPaymentRoute({ type: 'rhinestone' } as Signer)).toBe(
      'intent',
    )
  })

  it('keeps EOA-only mode on the wallet route', () => {
    expect(getRenewalPaymentRoute({ type: 'eoa' } as Signer)).toBe('wallet')
  })

  it('has no route while the signer initializes, rather than the wallet', () => {
    expect(getRenewalPaymentRoute(null)).toBeNull()
    expect(getRenewalPaymentRoute(undefined)).toBeNull()
  })
})

describe('resolveRenewalSigner', () => {
  const walletClient = {} as WalletClient
  const connector = { id: 'walletConnect' } as Connector
  const hcaSigner = { type: 'rhinestone' } as Signer

  const resolve = (
    overrides: Partial<Parameters<typeof resolveRenewalSigner>[0]>,
  ) =>
    resolveRenewalSigner({
      signer: hcaSigner,
      walletClient,
      connector,
      isSafeWallet: false,
      ...overrides,
    })

  it('renews a Safe{Wallet} from the wallet, with the connector that settles its executions', () => {
    expect(resolve({ isSafeWallet: true })).toEqual({
      type: 'eoa',
      walletClient,
      walletId: 'walletConnect',
      connector,
    })
  })

  it("keeps the account's signer for any other wallet", () => {
    expect(resolve({ isSafeWallet: false })).toBe(hcaSigner)
  })

  it.each([
    {
      scenario: 'the Safe check is pending',
      isSafeWallet: undefined,
      client: walletClient,
    },
    {
      scenario: 'a Safe has no wallet client',
      isSafeWallet: true,
      client: null,
    },
  ])('has no signer while $scenario', ({ isSafeWallet, client }) => {
    expect(resolve({ isSafeWallet, walletClient: client })).toBeNull()
  })

  const signerCases: readonly {
    readonly name: string
    readonly signer: Signer | null
    readonly route: 'intent' | 'wallet' | null
  }[] = [
    { name: 'no signer', signer: null, route: null },
    { name: 'HCA signer', signer: hcaSigner, route: 'intent' },
    {
      name: 'EOA signer',
      signer: { type: 'eoa', walletClient },
      route: 'wallet',
    },
  ]
  const safeStates: readonly (boolean | undefined)[] = [undefined, false, true]
  const clients: readonly (WalletClient | null)[] = [null, walletClient]
  const connectors: readonly (Connector | undefined)[] = [undefined, connector]
  const routeMatrix = signerCases.flatMap(({ name, signer, route }) =>
    safeStates.flatMap((isSafeWallet) =>
      clients.flatMap((client) =>
        connectors.map((selectedConnector) => ({
          name,
          signer,
          route,
          isSafeWallet,
          client,
          selectedConnector,
        })),
      ),
    ),
  )

  it.each(routeMatrix)(
    'selects one route for $name, Safe=$isSafeWallet, wallet=$client, connector=$selectedConnector',
    ({ signer, route, isSafeWallet, client, selectedConnector }) => {
      const resolved = resolveRenewalSigner({
        signer,
        walletClient: client,
        connector: selectedConnector,
        isSafeWallet,
      })

      if (isSafeWallet === undefined || (isSafeWallet && !client)) {
        expect(resolved).toBeNull()
        expect(getRenewalPaymentRoute(resolved)).toBeNull()
        return
      }
      if (!isSafeWallet) {
        expect(resolved).toBe(signer)
        expect(getRenewalPaymentRoute(resolved)).toBe(route)
        return
      }

      expect(resolved).toEqual({
        type: 'eoa',
        walletClient: client,
        walletId: selectedConnector?.id,
        connector: selectedConnector,
      })
      expect(getRenewalPaymentRoute(resolved)).toBe('wallet')
    },
  )
})
