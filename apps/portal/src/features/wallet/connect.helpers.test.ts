import { createEmitter } from '@wagmi/core/internal'
import { describe, expect, it, vi } from 'vitest'
import type { Connector, ConnectorEventMap } from 'wagmi'
import {
  connectOnSupportedChain,
  getMetaMaskRoute,
  handOffPairingToMetaMask,
  isCoinbase,
  isConnectionCancelled,
  isMetaMask,
  normalizeConnectError,
  resolveConnectChainId,
  WALLETCONNECT_ID,
} from './connect.helpers'

// Minimal stand-in for a wagmi Connector — only the fields the matchers read.
const connector = (fields: Partial<Connector>): Connector =>
  ({ id: '', name: '', type: 'injected', ...fields }) as Connector

describe('isMetaMask', () => {
  it('matches the EIP-6963 rdns id', () => {
    expect(isMetaMask(connector({ id: 'io.metamask' }))).toBe(true)
  })

  it('matches by name', () => {
    expect(isMetaMask(connector({ id: 'injected', name: 'MetaMask' }))).toBe(
      true,
    )
  })

  it('does not match other wallets', () => {
    expect(isMetaMask(connector({ id: 'io.rabby', name: 'Rabby' }))).toBe(false)
  })
})

describe('isCoinbase', () => {
  it.each([
    { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet' },
    { id: 'com.coinbase.wallet', name: 'Coinbase Wallet' },
    { id: 'other', name: 'Coinbase Smart Wallet' },
  ])('matches Coinbase variant %o', (fields) => {
    expect(isCoinbase(connector(fields))).toBe(true)
  })

  it('does not match non-Coinbase wallets', () => {
    expect(isCoinbase(connector({ id: 'io.metamask', name: 'MetaMask' }))).toBe(
      false,
    )
  })
})

describe('isConnectionCancelled', () => {
  it('detects a viem UserRejectedRequestError by name', () => {
    const error = new Error('nope')
    error.name = 'UserRejectedRequestError'
    expect(isConnectionCancelled(error)).toBe(true)
  })

  it.each([
    'User rejected the request.',
    'user denied account authorization',
    'Connection request cancelled',
    'The request was canceled', // single-l spelling
  ])('detects rejection message: %s', (message) => {
    expect(isConnectionCancelled(new Error(message))).toBe(true)
  })

  it('treats other failures as not cancelled', () => {
    expect(isConnectionCancelled(new Error('network unreachable'))).toBe(false)
  })

  it('handles non-Error values', () => {
    expect(isConnectionCancelled('boom')).toBe(false)
    expect(isConnectionCancelled(undefined)).toBe(false)
  })
})

describe('normalizeConnectError', () => {
  it('returns the cancel copy for user rejections', () => {
    expect(normalizeConnectError(new Error('user rejected the request'))).toBe(
      'Connection cancelled',
    )
  })

  it('returns the generic copy for real failures (no raw detail leaked)', () => {
    expect(normalizeConnectError(new Error('RPC 500: rug'))).toBe(
      'Unable to connect wallet',
    )
  })
})

describe('getMetaMaskRoute', () => {
  const injected = connector({ id: 'io.metamask', name: 'MetaMask' })
  const walletConnect = connector({ id: WALLETCONNECT_ID })

  it.each([
    {
      device: 'desktop with the extension',
      input: { injected, walletConnect, isTouchDevice: false },
      expected: { kind: 'injected', connector: injected },
    },
    {
      device: "MetaMask's in-app browser",
      input: { injected, walletConnect, isTouchDevice: true },
      expected: { kind: 'injected', connector: injected },
    },
    {
      device: 'a phone without MetaMask injected',
      input: { injected: undefined, walletConnect, isTouchDevice: true },
      expected: { kind: 'app', connector: walletConnect },
    },
    {
      device: 'a phone on a build without WalletConnect',
      input: {
        injected: undefined,
        walletConnect: undefined,
        isTouchDevice: true,
      },
      expected: { kind: 'install' },
    },
    {
      device: 'desktop without the extension',
      input: { injected: undefined, walletConnect, isTouchDevice: false },
      expected: { kind: 'install' },
    },
  ])('$device', ({ input, expected }) => {
    expect(getMetaMaskRoute(input)).toEqual(expected)
  })
})

describe('handOffPairingToMetaMask', () => {
  const PAIRING_URI = 'wc:7f6e5d@2?relay-protocol=irn&symKey=abc'

  const setup = () => {
    const emitter = createEmitter<ConnectorEventMap>('test')
    const openUrl = vi.fn()
    const storage = { setItem: vi.fn() }
    const stop = handOffPairingToMetaMask(connector({ emitter }), {
      openUrl,
      storage,
    })
    const emitPairing = () =>
      emitter.emit('message', { type: 'display_uri', data: PAIRING_URI })
    return { emitter, emitPairing, openUrl, storage, stop }
  }

  it('opens the pairing in the MetaMask app and saves it as the app WalletConnect reopens', () => {
    const { emitPairing, openUrl, storage } = setup()

    emitPairing()

    expect(openUrl).toHaveBeenCalledWith(
      'metamask://wc?uri=wc%3A7f6e5d%402%3Frelay-protocol%3Dirn%26symKey%3Dabc',
    )
    expect(storage.setItem).toHaveBeenCalledWith(
      'WALLETCONNECT_DEEPLINK_CHOICE',
      '{"href":"metamask://","name":"MetaMask"}',
    )
  })

  it('still opens the app, without throwing into WalletConnect, when storage refuses the write', () => {
    const { emitPairing, openUrl, storage } = setup()
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(emitPairing).not.toThrow()
    expect(openUrl).toHaveBeenCalledOnce()
  })

  it('ignores other messages, and everything after unsubscribing', () => {
    const { emitter, emitPairing, openUrl, stop } = setup()

    emitter.emit('message', { type: 'other', data: PAIRING_URI })
    stop()
    emitPairing()

    expect(openUrl).not.toHaveBeenCalled()
  })
})

describe('resolveConnectChainId', () => {
  const chains = [{ id: 11155111 }] as const

  it("keeps the wallet's chain when the app supports it", () => {
    expect(resolveConnectChainId(11155111, chains)).toBe(11155111)
  })

  it('forces the first app chain when the wallet is elsewhere (e.g. mainnet)', () => {
    expect(resolveConnectChainId(1, chains)).toBe(11155111)
  })
})

describe('connectOnSupportedChain', () => {
  const chains = [{ id: 11155111 }] as const

  // `getChainId` is read twice on the WalletConnect path (never before the
  // connect, once after), so tests queue the values it should report.
  const wcConnector = (...chainIds: number[]) => {
    const getChainId = vi.fn()
    for (const id of chainIds) getChainId.mockResolvedValueOnce(id)
    return connector({ id: WALLETCONNECT_ID, getChainId }) as Connector & {
      getChainId: ReturnType<typeof vi.fn>
    }
  }

  const actions = () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    switchChain: vi.fn().mockResolvedValue(undefined),
    onChainSwitchFailed: vi.fn(),
  })

  it('passes a resolved chainId up front for injected connectors', async () => {
    const injected = connector({
      id: 'io.metamask',
      getChainId: vi.fn().mockResolvedValue(1),
    })
    const a = actions()

    await connectOnSupportedChain(injected, chains, a)

    expect(a.connect).toHaveBeenCalledWith({
      connector: injected,
      chainId: 11155111,
    })
    expect(a.switchChain).not.toHaveBeenCalled()
  })

  it('connects WalletConnect WITHOUT a chainId, then switches', async () => {
    // Settles on mainnet — the case that used to hang wagmi's connector.
    const wc = wcConnector(1)
    const a = actions()

    await connectOnSupportedChain(wc, chains, a)

    // No `chainId` key at all: handing one to the WalletConnect connector is
    // what triggers its in-connect switchChain deadlock.
    expect(a.connect).toHaveBeenCalledWith({ connector: wc })
    expect(a.switchChain).toHaveBeenCalledWith({
      connector: wc,
      chainId: 11155111,
    })
  })

  it('reads the WalletConnect chain only after connecting', async () => {
    // Before the session settles `getChainId` reports the first optional
    // chain, which says nothing about what the wallet actually granted.
    const order: string[] = []
    const wc = connector({
      id: WALLETCONNECT_ID,
      getChainId: vi.fn(async () => {
        order.push('getChainId')
        return 1
      }),
    })
    const a = {
      ...actions(),
      connect: vi.fn(async () => {
        order.push('connect')
      }),
    }

    await connectOnSupportedChain(wc, chains, a)

    expect(order).toEqual(['connect', 'getChainId'])
  })

  it('skips the switch when WalletConnect already settled on a supported chain', async () => {
    const wc = wcConnector(11155111)
    const a = actions()

    await connectOnSupportedChain(wc, chains, a)

    expect(a.connect).toHaveBeenCalledWith({ connector: wc })
    expect(a.switchChain).not.toHaveBeenCalled()
  })

  it('keeps the connection when the post-connect switch fails', async () => {
    const wc = wcConnector(1)
    const a = actions()
    const error = new Error('user rejected the request')
    a.switchChain.mockRejectedValueOnce(error)

    await expect(
      connectOnSupportedChain(wc, chains, a),
    ).resolves.toBeUndefined()
    expect(a.onChainSwitchFailed).toHaveBeenCalledWith(error)
  })

  it('propagates a connect failure', async () => {
    const wc = wcConnector(1)
    const a = actions()
    a.connect.mockRejectedValueOnce(new Error('relay unreachable'))

    await expect(connectOnSupportedChain(wc, chains, a)).rejects.toThrow(
      'relay unreachable',
    )
    expect(a.switchChain).not.toHaveBeenCalled()
  })
})
