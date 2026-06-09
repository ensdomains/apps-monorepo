// biome-ignore-all lint/suspicious/noExplicitAny: test mocks need flexible typing
import {
  type Address,
  bytesToHex,
  type EIP1193Provider,
  type TransactionSerializable,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { privyAccountFromProvider } from './privy-signer'

const ADDRESS = '0x1234567890123456789012345678901234567890' as Address
const TO = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca' as Address

const makeProvider = (result = '0xsignature') =>
  ({ request: vi.fn().mockResolvedValue(result) }) as unknown as EIP1193Provider

describe('privyAccountFromProvider', () => {
  it('exposes the provided address', async () => {
    const account = await privyAccountFromProvider(makeProvider(), ADDRESS)
    expect(account.address).toBe(ADDRESS)
  })

  it('signMessage (string) → personal_sign with the UTF-8 hex of the message', async () => {
    const provider = makeProvider('0xdeadbeef')
    const account = await privyAccountFromProvider(provider, ADDRESS)

    const sig = await account.signMessage({ message: 'hello' })

    expect(sig).toBe('0xdeadbeef')
    expect(provider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: [bytesToHex(new TextEncoder().encode('hello')), ADDRESS],
    })
  })

  it('signMessage (raw bytes) → personal_sign with the raw hex', async () => {
    const provider = makeProvider()
    const account = await privyAccountFromProvider(provider, ADDRESS)
    const raw = new Uint8Array([1, 2, 3])

    await account.signMessage({ message: { raw } })

    expect(provider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: [bytesToHex(raw), ADDRESS],
    })
  })

  it('signTypedData → eth_signTypedData_v4 with [address, JSON]', async () => {
    const provider = makeProvider()
    const account = await privyAccountFromProvider(provider, ADDRESS)
    const typedData = {
      domain: { name: 'Test' },
      types: { Foo: [{ name: 'bar', type: 'string' }] },
      primaryType: 'Foo',
      message: { bar: 'baz' },
    } as const

    await account.signTypedData(typedData)

    expect(provider.request).toHaveBeenCalledWith({
      method: 'eth_signTypedData_v4',
      params: [ADDRESS, JSON.stringify(typedData)],
    })
  })

  it('signTransaction → eth_signTransaction with bigint quantities as hex', async () => {
    const provider = makeProvider()
    const account = await privyAccountFromProvider(provider, ADDRESS)

    const tx: TransactionSerializable = {
      to: TO,
      value: 1000n,
      nonce: 5,
      gas: 21000n,
      chainId: 1,
      maxFeePerGas: 2000n,
      maxPriorityFeePerGas: 100n,
      type: 'eip1559',
    }
    await account.signTransaction(tx)

    const call = (provider.request as any).mock.calls[0][0]
    expect(call.method).toBe('eth_signTransaction')
    const rpcTx = call.params[0]
    expect(rpcTx.from).toBe(ADDRESS)
    expect(rpcTx.to).toBe(TO)
    expect(rpcTx.value).toBe('0x3e8') // 1000
    expect(rpcTx.nonce).toBe('0x5')
    expect(rpcTx.gas).toBe('0x5208') // 21000
    expect(rpcTx.maxFeePerGas).toBe('0x7d0') // 2000
    expect(rpcTx.maxPriorityFeePerGas).toBe('0x64') // 100
  })
})
