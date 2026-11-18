import type { Address } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReadOnlyProvider,
  promptForReadOnlyWallet,
  toReadOnlyWalletAddress,
} from './readOnlyWallet'

const ADDRESS: Address = '0x000000000000000000000000000000000000dEaD'
const CHAIN_ID = 11155111

describe('toReadOnlyWalletAddress', () => {
  it('trims and checksums a valid address', () => {
    expect(
      toReadOnlyWalletAddress('  0x000000000000000000000000000000000000dead  '),
    ).toBe(ADDRESS)
  })

  it('rejects a non-address', () => {
    expect(toReadOnlyWalletAddress('test.eth')).toBeNull()
    expect(toReadOnlyWalletAddress('')).toBeNull()
  })
})

describe('createReadOnlyProvider', () => {
  const provider = createReadOnlyProvider({
    address: ADDRESS,
    chainId: CHAIN_ID,
  })

  it('reports the configured account and chain', async () => {
    await expect(provider.request({ method: 'eth_accounts' })).resolves.toEqual(
      [ADDRESS],
    )
    await expect(provider.request({ method: 'eth_chainId' })).resolves.toBe(
      '0xaa36a7',
    )
  })

  it.each(['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'])(
    'rejects the write method %s',
    async (method) => {
      await expect(provider.request({ method })).rejects.toMatchObject({
        code: 4100,
      })
    },
  )
})

describe('promptForReadOnlyWallet', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const lookup = async (
    input: string,
    resolveName: (name: string) => Promise<Address | null>,
  ) => {
    const browser = Object.assign(new EventTarget(), { prompt: () => input })
    vi.stubGlobal('window', browser)
    const onError = vi.fn()
    const onAnnounce = vi.fn()
    browser.addEventListener('eip6963:announceProvider', onAnnounce)

    await promptForReadOnlyWallet({
      resolveName,
      chainId: CHAIN_ID,
      signal: new AbortController().signal,
      onError,
    })

    return { onError, onAnnounce }
  }

  it('looks up the normalized name and announces the wallet', async () => {
    const resolveName = vi.fn(async (name: string) =>
      name === 'example.eth' ? ADDRESS : null,
    )
    const { onError, onAnnounce } = await lookup('  EXAMPLE.eth  ', resolveName)

    expect(onError).toHaveBeenCalledWith(null)
    expect(onAnnounce).toHaveBeenCalledOnce()
  })

  it('rejects invalid ENS input before querying', async () => {
    const resolveName = vi.fn(async () => null)
    const { onError } = await lookup('example .eth', resolveName)

    expect(resolveName).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      'Enter a valid Ethereum address or ENS name',
    )
  })

  it('reports when an ENS name has no address', async () => {
    const { onError } = await lookup('example.eth', async () => null)

    expect(onError).toHaveBeenCalledWith(
      'No Ethereum address found for this ENS name',
    )
  })

  it('reports an RPC failure and logs the cause', async () => {
    const cause = new Error('RPC unavailable')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { onError } = await lookup('example.eth', () => Promise.reject(cause))

    expect(onError).toHaveBeenCalledWith(
      'Could not look up this ENS name. Try again.',
    )
    expect(warn).toHaveBeenCalledWith(
      'Read-only wallet ENS lookup failed',
      cause,
    )
  })
})
