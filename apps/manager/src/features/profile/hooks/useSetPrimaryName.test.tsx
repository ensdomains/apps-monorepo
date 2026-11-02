import type { RhinestoneSigner } from '@ens-apps/transaction-manager'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { Connector } from 'wagmi'
import { useSetPrimaryName } from './useSetPrimaryName'

const OWNER = '0x3333333333333333333333333333333333333333'
const HCA_SIGNER = { type: 'rhinestone' } as RhinestoneSigner
// checkIsSafeWallet reads only `type` and the WalletConnect session's peer.
const SAFE_CONNECTOR = {
  type: 'walletConnect',
  getProvider: async () => ({
    session: {
      peer: {
        metadata: { name: 'Safe{Wallet}', url: 'https://app.safe.global' },
      },
    },
  }),
} as unknown as Connector
const INJECTED_CONNECTOR = { type: 'injected' } as Connector

const mocks = vi.hoisted(() => ({
  connector: undefined as Connector | undefined,
  setPrimaryName: vi.fn(),
  setPrimaryNameWithHca: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useChainId: () => 11155111,
  useConnection: () => ({ address: OWNER, connector: mocks.connector }),
}))
vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    signer: HCA_SIGNER,
    ownerAddress: OWNER,
    walletClient: { account: { address: OWNER } },
  }),
  useHcaFundingPrompt: () => ({
    prompt: null,
    confirmFunding: async () => true,
    approve: () => {},
    decline: () => {},
  }),
}))
vi.mock('../service/setPrimaryName', () => ({
  setPrimaryName: mocks.setPrimaryName,
  setPrimaryNameWithHca: mocks.setPrimaryNameWithHca,
}))

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

describe('useSetPrimaryName', () => {
  beforeEach(() => {
    mocks.setPrimaryName.mockReset().mockResolvedValue(undefined)
    mocks.setPrimaryNameWithHca.mockReset().mockResolvedValue(undefined)
  })

  it.each<{
    readonly wallet: string
    readonly connector: Connector
    readonly sent: Mock
    readonly sentWith: Record<string, unknown>
    readonly skipped: Mock
  }>([
    {
      wallet: 'a Safe{Wallet} sends both transactions itself',
      connector: SAFE_CONNECTOR,
      sent: mocks.setPrimaryName,
      sentWith: { connector: SAFE_CONNECTOR },
      skipped: mocks.setPrimaryNameWithHca,
    },
    {
      wallet: 'another wallet signs the HCA intent',
      connector: INJECTED_CONNECTOR,
      sent: mocks.setPrimaryNameWithHca,
      sentWith: { signer: HCA_SIGNER },
      skipped: mocks.setPrimaryName,
    },
  ])('$wallet', async ({ connector, sent, sentWith, skipped }) => {
    mocks.connector = connector
    const { result } = renderHook(() => useSetPrimaryName(), { wrapper })

    await act(() => result.current.submit({ name: 'alice.eth', owner: OWNER }))

    expect(sent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'alice.eth', ...sentWith }),
    )
    expect(skipped).not.toHaveBeenCalled()
  })
})
