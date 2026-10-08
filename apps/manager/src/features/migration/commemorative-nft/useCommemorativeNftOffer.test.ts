import type { EnsNetwork } from '@ens-apps/config'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { Config as WagmiConfig } from '@wagmi/core'
import { createElement, type ReactNode, useEffect } from 'react'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommemorativeNftDashboard } from '../components/success/CommemorativeNftDashboard'
import { CommemorativeNftProfileSection } from '../components/success/CommemorativeNftProfileSection'
import { getCommemorativeNftContractAddress } from './config'
import { MAINNET_NFT_TEST_ADDRESS } from './config.fixture'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import {
  commemorativeNftClaimedQueryOptions,
  commemorativeNftEligibilityQueryOptions,
} from './queries'
import type { CommemorativeNftEligibilityResult } from './types'
import { useCommemorativeNftOffer } from './useCommemorativeNftOffer'

const mockEnvConfig = vi.hoisted((): { network: EnsNetwork } => ({
  network: 'mainnet',
}))
const mocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  claimed: vi.fn(),
  completion: vi.fn(),
  pending: vi.fn(),
  owner: vi.fn(),
  navigate: vi.fn(),
  chain: vi.fn(),
  mounted: vi.fn(),
  unmounted: vi.fn(),
}))
vi.mock('@/config', () => ({ envConfig: mockEnvConfig }))
vi.mock('wagmi', () => ({ useChainId: mocks.chain, useConfig: () => ({}) }))
vi.mock('@/lib/posthog/useMigrationNftEnabled', () => ({
  useMigrationNftEnabled: () => true,
}))
vi.mock('./useVerifiedCommemorativeNftOwner', () => ({
  useVerifiedCommemorativeNftOwner: mocks.owner,
}))
vi.mock('./contract', () => ({ readCommemorativeNftClaimed: mocks.claimed }))
vi.mock('./eligibility', () => ({
  fetchCommemorativeNftEligibility: mocks.metadata,
}))
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  getCommemorativeNftContractAddress: vi.fn(),
}))
vi.mock('./usePendingCommemorativeNftClaim', () => ({
  usePendingCommemorativeNftClaim: mocks.pending,
}))
vi.mock('./useCommemorativeNftMigrationCompletion', () => ({
  useCommemorativeNftMigrationCompletion: mocks.completion,
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/components/ui/material-symbol', () => ({ MSymbol: () => null }))
vi.mock('../components/success/CommemorativeNftCard', () => ({
  CommemorativeNftCard: () => null,
}))
vi.mock('../components/success/CommemorativeNftClaimDialog', () => ({
  CommemorativeNftClaimDialog: ({
    open,
    ...props
  }: DialogProps & { open: boolean }) =>
    open ? createElement(ObservedDialog, props) : null,
}))

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const published: CommemorativeNftEligibilityResult = {
  status: 'eligible',
  eligibility: {
    ...createCommemorativeNftPreviewEligibility({
      ownerAddress,
      profileName: 'yoginth.eth',
    }),
    source: 'static',
    proof: [
      '0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631',
    ],
    assets: { metadataUrl: 'https://assets.example/token/42.json' },
  },
}
type DialogProps = {
  ownerAddress: Address
  onClose: () => void
  onOpenDashboard: () => void
}
const ObservedDialog = ({
  ownerAddress: owner,
  onClose,
  onOpenDashboard,
}: DialogProps) => {
  useCommemorativeNftOffer({ ownerAddress: owner, enabled: true })
  useEffect(() => {
    mocks.mounted()
    return () => {
      mocks.unmounted()
    }
  }, [])
  return createElement(
    'div',
    { role: 'dialog' },
    createElement('button', { onClick: onClose, type: 'button' }, 'Close'),
    createElement(
      'button',
      { onClick: onOpenDashboard, type: 'button' },
      'Go to dashboard',
    ),
  )
}
const clients: QueryClient[] = []
const getContractAddress = vi.mocked(getCommemorativeNftContractAddress)
const createContext = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  clients.push(client)
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(I18nProvider, { i18n }, children),
    )
  return { client, wrapper }
}

describe('shared commemorative NFT offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnvConfig.network = 'mainnet'
    getContractAddress.mockReturnValue(MAINNET_NFT_TEST_ADDRESS)
    vi.stubGlobal('navigator', { locks: { request: vi.fn() } })
    mocks.owner.mockReturnValue(ownerAddress)
    mocks.chain.mockReturnValue(1)
    mocks.metadata.mockResolvedValue(published)
    mocks.claimed.mockResolvedValue(false)
    mocks.pending.mockReturnValue({ status: 'empty' })
    mocks.completion.mockImplementation(
      ({ enabled }: { enabled: boolean }) => ({
        isComplete: enabled,
        isFreshComplete: enabled,
      }),
    )
  })
  afterEach(() => {
    cleanup()
    for (const client of clients.splice(0)) client.clear()
    vi.unstubAllGlobals()
  })

  it('hides cached offers and recovery without a configured deployment', () => {
    const { client, wrapper } = createContext()
    client.setQueryData(
      commemorativeNftEligibilityQueryOptions({ ownerAddress }).queryKey,
      published,
    )
    getContractAddress.mockReturnValue(undefined)
    mocks.pending.mockReturnValue({ status: 'unavailable' })
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )

    expect(result.current.visibleEligibility).toBeUndefined()
    expect(result.current.canRecoverClaim).toBe(false)
    expect(result.current.canOpenMint).toBe(false)
    expect(result.current.canSubmitMint).toBe(false)
    expect(mocks.metadata).not.toHaveBeenCalled()
    expect(mocks.claimed).not.toHaveBeenCalled()
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
  })

  it.each([
    undefined,
    {},
    { locks: {} },
  ])('hides fresh mint offers when browser coordination is unavailable: %j', async (browserNavigator) => {
    vi.stubGlobal('navigator', browserNavigator)
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.availability.hasFreshEligibilityResult).toBe(true),
    )
    await waitFor(() =>
      expect(result.current.availability.isConfirmedUnclaimed).toBe(true),
    )

    expect(result.current.visibleEligibility).toBeUndefined()
    expect(result.current.canOpenMint).toBe(false)
    expect(result.current.canSubmitMint).toBe(false)
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
  })

  it('keeps minted NFTs visible without browser coordination', async () => {
    vi.stubGlobal('navigator', {})
    mocks.claimed.mockResolvedValue(true)
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.minted).toBe(true))
    await waitFor(() =>
      expect(result.current.visibleEligibility).toEqual(published.eligibility),
    )
    expect(result.current.canOpenMint).toBe(false)
    expect(result.current.canSubmitMint).toBe(false)
  })

  it('shows the revealed dashboard card after a verified mint without reopening mint', async () => {
    const { client, wrapper } = createContext()
    client.setQueryData(
      commemorativeNftClaimedQueryOptions({
        ownerAddress,
        chainId: 1,
        wagmiConfig: {} as WagmiConfig,
      }).queryKey,
      true,
    )
    render(createElement(CommemorativeNftDashboard), { wrapper })

    expect(await screen.findByText('Welcome to ENSv2')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Mint' })).toBeNull()
    expect(mocks.claimed).not.toHaveBeenCalled()
  })

  it('keeps claim recovery available without browser coordination', async () => {
    vi.stubGlobal('navigator', {})
    mocks.pending.mockReturnValue({ status: 'unavailable' })
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.visibleEligibility).toEqual(published.eligibility),
    )
    expect(result.current.canRecoverClaim).toBe(true)
    expect(result.current.canOpenMint).toBe(true)
    expect(result.current.canSubmitMint).toBe(false)
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
  })

  it.each([
    'ineligible',
    'unavailable',
  ] as const)('does not enable completion scans for %s metadata', async (status) => {
    mocks.metadata.mockResolvedValue({ status })
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.availability.eligibility.isSuccess).toBe(true),
    )
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
    expect(result.current.canOpenMint).toBe(false)
  })

  it('does not scan completed claims', async () => {
    mocks.claimed.mockResolvedValue(true)
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.minted).toBe(true))
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
  })

  it('keeps scoped metadata visible after a background error but disables submission', async () => {
    const { client, wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.canSubmitMint).toBe(true))
    mocks.metadata.mockRejectedValue(new Error('Offline'))
    await act(async () =>
      client.invalidateQueries({
        queryKey: commemorativeNftEligibilityQueryOptions({ ownerAddress })
          .queryKey,
      }),
    )
    await waitFor(() =>
      expect(result.current.availability.eligibility.isError).toBe(true),
    )
    expect(result.current.visibleEligibility).toEqual(published.eligibility)
    expect(result.current.migrationCompletion.isComplete).toBe(true)
    expect(result.current.canSubmitMint).toBe(false)
  })

  it('opens recovery without a completion scan or authorizing a mint', () => {
    mocks.pending.mockReturnValue({ status: 'unavailable' })
    const { wrapper } = createContext()
    const { result } = renderHook(
      () => useCommemorativeNftOffer({ ownerAddress, enabled: true }),
      { wrapper },
    )
    expect(result.current.canRecoverClaim).toBe(true)
    expect(result.current.canOpenMint).toBe(true)
    expect(result.current.canSubmitMint).toBe(false)
    expect(
      mocks.completion.mock.calls.every(([params]) => !params.enabled),
    ).toBe(true)
  })

  it.each([
    'reconciling',
    'error',
  ] as const)('keeps %s completion actionable for retry, never for minting', async (status) => {
    mocks.completion.mockReturnValue({
      status,
      isComplete: false,
      isFreshComplete: false,
    })
    const { wrapper } = createContext()
    render(
      createElement(CommemorativeNftProfileSection, {
        isOwner: true,
        name: 'yoginth.eth',
      }),
      { wrapper },
    )
    const trigger = await screen.findByRole('button', { name: 'Check status' })
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    expect(
      screen.queryByRole('button', { name: 'Preview and mint' }),
    ).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('drops visible eligibility immediately when the owner or network changes', async () => {
    const { wrapper } = createContext()
    const { result, rerender } = renderHook(
      ({ owner }: { owner: Address }) =>
        useCommemorativeNftOffer({ ownerAddress: owner, enabled: true }),
      { wrapper, initialProps: { owner: ownerAddress as Address } },
    )
    await waitFor(() => expect(result.current.canSubmitMint).toBe(true))
    rerender({ owner: '0x1111111111111111111111111111111111111111' })
    expect(result.current.visibleEligibility).toBeUndefined()
    expect(result.current.canSubmitMint).toBe(false)
    mockEnvConfig.network = 'sepolia'
    mocks.chain.mockReturnValue(11155111)
    rerender({ owner: ownerAddress })
    expect(result.current.visibleEligibility).toBeUndefined()
    expect(result.current.canSubmitMint).toBe(false)
  })

  it('keeps one profile dialog and its section through delayed metadata revalidation', async () => {
    const { wrapper } = createContext()
    render(
      createElement(CommemorativeNftProfileSection, {
        isOwner: true,
        name: 'yoginth.eth',
      }),
      { wrapper },
    )
    const trigger = await screen.findByRole('button', {
      name: 'Preview and mint',
    })
    let finish: ((value: CommemorativeNftEligibilityResult) => void) | undefined
    mocks.metadata.mockImplementationOnce(
      () =>
        new Promise<CommemorativeNftEligibilityResult>((resolve) => {
          finish = resolve
        }),
    )
    fireEvent.click(trigger)
    await waitFor(() => expect(mocks.metadata).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('ENSv2 commemorative NFT')).toBeDefined()
    expect(mocks.mounted).toHaveBeenCalledTimes(1)
    expect(mocks.unmounted).not.toHaveBeenCalled()
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish?.(published))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(mocks.metadata).toHaveBeenCalledTimes(2)
    expect(mocks.mounted).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Go to dashboard' }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/dashboard' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
