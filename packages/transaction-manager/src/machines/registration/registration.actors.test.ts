import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import type { Signer } from '../../types/signer.types'
import { type Call, getPrimaryCall } from '../../types/transaction.types'
import { createTransactionRequest } from './registration.actors'

const FROM = '0xF00000000000000000000000000000000000000F' as Address
const eoaSigner = { type: 'eoa' } as unknown as Signer
const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const permitCall: Call = {
  to: '0x1111111111111111111111111111111111111111' as Address,
  data: '0xd505accf' as Hex,
  value: 0n,
}
const registerCall: Call = {
  to: '0x2222222222222222222222222222222222222222' as Address,
  data: '0x12345678' as Hex,
  value: 7n,
}

describe('createTransactionRequest', () => {
  it('derives EOA top-level fields from the single call', () => {
    const request = createTransactionRequest({
      signer: eoaSigner,
      from: FROM,
      chainId: 11155111,
      calls: [registerCall],
    })

    expect(request.type).toBe('eoa')
    if (request.type !== 'eoa') throw new Error('expected eoa request')
    // Top-level call data is exactly the (only) call — no divergent copy.
    expect(request.to).toBe(registerCall.to)
    expect(request.data).toBe(registerCall.data)
    expect(request.value).toBe(registerCall.value)
  })

  it('stores calls verbatim for a rhinestone intent with no top-level copy', () => {
    const calls = [permitCall, registerCall]
    const request = createTransactionRequest({
      signer: rhinestoneSigner,
      from: FROM,
      chainId: 11155111,
      calls,
    })

    expect(request.type).toBe('rhinestone-intent')
    if (request.type !== 'rhinestone-intent') {
      throw new Error('expected rhinestone-intent request')
    }
    // calls is the single source of truth.
    expect(request.rhinestoneParams.calls).toEqual(calls)
    // There is no top-level call data that could diverge from calls.
    expect('to' in request).toBe(false)
    expect('data' in request).toBe(false)
    expect('value' in request).toBe(false)
    // getPrimaryCall resolves the representative call from calls[0].
    expect(getPrimaryCall(request)).toEqual({
      to: permitCall.to,
      data: permitCall.data,
      value: permitCall.value,
    })
  })

  it('rejects a multi-call batch for an EOA signer', () => {
    expect(() =>
      createTransactionRequest({
        signer: eoaSigner,
        from: FROM,
        chainId: 11155111,
        calls: [permitCall, registerCall],
      }),
    ).toThrow(/single call/i)
  })

  it('rejects an empty calls array', () => {
    expect(() =>
      createTransactionRequest({
        signer: rhinestoneSigner,
        from: FROM,
        chainId: 11155111,
        calls: [],
      }),
    ).toThrow(/at least one call/i)
  })
})
