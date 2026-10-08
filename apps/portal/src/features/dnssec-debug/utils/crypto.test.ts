import { describe, expect, it } from 'vitest'
import {
  parseRsaPublicKey,
  verifyDnssecSignature,
  verifyDsDigest,
} from './crypto'

const sha256 = async (data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)))

describe('parseRsaPublicKey', () => {
  it('reads a one-byte exponent length (RFC 3110)', () => {
    expect(parseRsaPublicKey(Uint8Array.of(3, 1, 0, 1, 0xab, 0xcd))).toEqual({
      kty: 'RSA',
      e: 'AQAB',
      n: 'q80',
      ext: true,
    })
  })

  it('reads a three-byte exponent length', () => {
    expect(parseRsaPublicKey(Uint8Array.of(0, 0, 3, 1, 0, 1, 0xab))?.e).toBe(
      'AQAB',
    )
  })

  it('rejects truncated keys', () => {
    expect(parseRsaPublicKey(Uint8Array.of(3, 1, 0))).toBeNull()
  })
})

describe('verifyDnssecSignature', () => {
  it('reports algorithms it has no implementation for as unsupported', async () => {
    const verdict = await verifyDnssecSignature({
      algorithm: 12,
      publicKey: new Uint8Array(64),
      data: new Uint8Array(1),
      signature: new Uint8Array(64),
    })
    expect(verdict).toBe('unsupported')
  })

  it('treats a malformed key as an invalid signature', async () => {
    const verdict = await verifyDnssecSignature({
      algorithm: 13,
      publicKey: new Uint8Array(10),
      data: new Uint8Array(1),
      signature: new Uint8Array(64),
    })
    expect(verdict).toBe('invalid')
  })

  it('verifies Ed25519 signatures', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    const data = new TextEncoder().encode('signed rrset')
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, data),
    )
    const publicKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    )

    await expect(
      verifyDnssecSignature({ algorithm: 15, publicKey, data, signature }),
    ).resolves.toBe('valid')
    await expect(
      verifyDnssecSignature({
        algorithm: 15,
        publicKey,
        data: new TextEncoder().encode('tampered'),
        signature,
      }),
    ).resolves.toBe('invalid')
  })
})

describe('verifyDsDigest', () => {
  it('compares SHA-256 digests', async () => {
    const data = Uint8Array.of(1, 2, 3)
    const digest = await sha256(data)
    await expect(verifyDsDigest({ digestType: 2, data, digest })).resolves.toBe(
      'valid',
    )
    await expect(
      verifyDsDigest({ digestType: 2, data: Uint8Array.of(4), digest }),
    ).resolves.toBe('invalid')
  })

  it('reports unknown digest types as unsupported', async () => {
    await expect(
      verifyDsDigest({
        digestType: 3,
        data: new Uint8Array(),
        digest: new Uint8Array(),
      }),
    ).resolves.toBe('unsupported')
  })
})
