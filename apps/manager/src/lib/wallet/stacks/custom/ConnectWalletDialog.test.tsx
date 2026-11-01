import { setImmediate } from 'node:timers/promises'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import {
  ApiController,
  CoreHelperUtil,
  EventsController,
  ModalController,
  OptionsController,
  RouterController,
} from '@reown/appkit-controllers'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { mainnet } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Connector, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { prepareOathConnectionView } from '@/lib/wallet/oathWallet'
import { ConnectWalletDialog } from './ConnectWalletDialog'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  switchChain: vi.fn(),
  getChainId: vi.fn(),
  connectors: [] as Connector[],
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnectors: () => mocks.connectors,
  useConnect: () => ({ mutateAsync: mocks.connect }),
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChain }),
}))
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: { chains: [{ id: 1 }] } }))

const testConfig = createConfig({
  chains: [mainnet],
  connectors: [
    injected({
      target: {
        id: 'walletConnect',
        name: 'WalletConnect',
        provider: () => undefined,
      },
    }),
  ],
  transports: { [mainnet.id]: http() },
})
const testConnector = testConfig.connectors[0]
if (!testConnector) throw new Error('Test connector missing')
const walletConnect: Connector = {
  ...testConnector,
  type: 'walletConnect',
  getChainId: mocks.getChainId,
}

const renderDialog = () => {
  i18n.load('en', {})
  i18n.activate('en')
  const onOpenChange = vi.fn()
  render(
    <I18nProvider i18n={i18n}>
      <ConnectWalletDialog onOpenChange={onOpenChange} open />
    </I18nProvider>,
  )
  return onOpenChange
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.connectors = [walletConnect]
  mocks.connect.mockResolvedValue(undefined)
  mocks.getChainId.mockResolvedValue(1)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Oath Wallet entry', () => {
  it('starts the existing QR connector directly and closes the list before pairing', async () => {
    const onOpenChange = renderDialog()
    fireEvent.click(
      screen.getByRole('button', { name: 'Oath Wallet iOS · WalletConnect' }),
    )
    await waitFor(() =>
      expect(mocks.connect).toHaveBeenCalledExactlyOnceWith({
        connector: walletConnect,
      }),
    )
    expect(onOpenChange).toHaveBeenCalledBefore(mocks.connect)
    expect(mocks.switchChain).not.toHaveBeenCalled()
  })

  it('does not offer Oath when the WalletConnect connector is unavailable', () => {
    mocks.connectors = []
    renderDialog()
    expect(screen.queryByRole('button', { name: /Oath Wallet/ })).toBeNull()
  })

  it('keeps the generic entry available and prevents overlapping requests', async () => {
    mocks.connect.mockReturnValue(new Promise(() => {}))
    renderDialog()
    const generic = screen.getByRole('button', {
      name: 'WalletConnect',
    })
    fireEvent.click(screen.getByRole('button', { name: /Oath Wallet/ }))
    fireEvent.click(generic)
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1))
    expect(generic.hasAttribute('disabled')).toBe(true)
  })
})

describe('Oath presentation with installed AppKit controllers', () => {
  it.each([false, true])(
    'opens Oath directly, retains it on reopening and releases generic routing (mobile=%s)',
    async (mobile) => {
      vi.spyOn(ApiController, 'prefetch').mockResolvedValue([])
      vi.spyOn(CoreHelperUtil, 'isMobile').mockReturnValue(mobile)
      vi.spyOn(EventsController, 'sendEvent').mockImplementation(
        () => undefined,
      )
      const originalManualControl = OptionsController.state.manualWCControl
      OptionsController.setManualWCControl(true)
      const routes: { view: string; wallet: string | undefined }[] = []
      mocks.connect.mockImplementationOnce(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          await ModalController.open()
          await setImmediate()
          routes.push({
            view: RouterController.state.view,
            wallet: RouterController.state.data?.wallet?.name,
          })
        }
        ModalController.close()
        throw new Error('User rejected the request')
      })
      try {
        renderDialog()
        fireEvent.click(screen.getByRole('button', { name: /Oath Wallet/ }))
        await waitFor(() => {
          expect(routes).toHaveLength(2)
          expect(
            screen
              .getByRole('button', { name: /Oath Wallet/ })
              .hasAttribute('disabled'),
          ).toBe(false)
        })
        expect(routes).toEqual([
          { view: 'ConnectingWalletConnect', wallet: 'Oath Wallet' },
          { view: 'ConnectingWalletConnect', wallet: 'Oath Wallet' },
        ])
        await ModalController.open()
        await setImmediate()
        expect(RouterController.state.view).toBe(
          mobile ? 'AllWallets' : 'ConnectingWalletConnectBasic',
        )
        expect(RouterController.state.data).toBeUndefined()
      } finally {
        ModalController.close()
        OptionsController.setManualWCControl(originalManualControl)
      }
    },
  )
})

it('does not install a presentation after its owner has already unmounted', async () => {
  vi.spyOn(ApiController, 'prefetch').mockResolvedValue([])
  vi.spyOn(CoreHelperUtil, 'isMobile').mockReturnValue(true)
  vi.spyOn(EventsController, 'sendEvent').mockImplementation(() => undefined)
  const originalManualControl = OptionsController.state.manualWCControl
  OptionsController.setManualWCControl(true)
  const attempt = new AbortController()
  attempt.abort()
  try {
    await prepareOathConnectionView(attempt.signal)
    await ModalController.open()
    await setImmediate()
    expect(RouterController.state.view).toBe('AllWallets')
    expect(RouterController.state.data).toBeUndefined()
  } finally {
    ModalController.close()
    OptionsController.setManualWCControl(originalManualControl)
  }
})
