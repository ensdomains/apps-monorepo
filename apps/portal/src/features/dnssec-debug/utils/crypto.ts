import { fromPromise } from 'neverthrow'
import { concatBytes } from 'viem'
import { toBase64Url } from './wire'

export type CryptoVerdict = 'valid' | 'invalid' | 'unsupported'

type VerifyParams = {
  readonly algorithm: number
  readonly publicKey: Uint8Array
  readonly data: Uint8Array
  readonly signature: Uint8Array
}

type KeySpec = {
  readonly format: 'raw' | 'jwk'
  readonly keyData: Uint8Array | JsonWebKey
  readonly importParams:
    | AlgorithmIdentifier
    | RsaHashedImportParams
    | EcKeyImportParams
  readonly verifyParams: AlgorithmIdentifier | EcdsaParams
}

// WebCrypto takes BufferSource views backed by a plain ArrayBuffer.
const toBufferSource = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes)

const stripLeadingZeros = (bytes: Uint8Array): Uint8Array => {
  const start = bytes.findIndex((byte) => byte !== 0)
  return start <= 0 ? bytes : bytes.subarray(start)
}

/** RSA public key in DNSKEY form (RFC 3110 §2) → JWK. */
export const parseRsaPublicKey = (key: Uint8Array): JsonWebKey | null => {
  if (key.length < 3) return null
  const isLongExponent = key[0] === 0
  const exponentLength = isLongExponent ? (key[1] << 8) | key[2] : key[0]
  const offset = isLongExponent ? 3 : 1
  const exponent = key.subarray(offset, offset + exponentLength)
  const modulus = key.subarray(offset + exponentLength)
  if (exponent.length === 0 || modulus.length === 0) return null
  return {
    kty: 'RSA',
    e: toBase64Url(stripLeadingZeros(exponent)),
    n: toBase64Url(stripLeadingZeros(modulus)),
    ext: true,
  }
}

const rsaSpec = (key: Uint8Array, hash: string): KeySpec | null => {
  const jwk = parseRsaPublicKey(key)
  if (!jwk) return null
  return {
    format: 'jwk',
    keyData: jwk,
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  }
}

// ECDSA keys are the bare X‖Y point (RFC 6605 §4); WebCrypto wants it
// uncompressed-prefixed. Signatures are r‖s, which is WebCrypto's format too.
const ecdsaSpec = (
  key: Uint8Array,
  namedCurve: string,
  hash: string,
): KeySpec => ({
  format: 'raw',
  keyData: concatBytes([Uint8Array.of(0x04), key]),
  importParams: { name: 'ECDSA', namedCurve },
  verifyParams: { name: 'ECDSA', hash },
})

const eddsaSpec = (key: Uint8Array, name: string): KeySpec => ({
  format: 'raw',
  keyData: key,
  importParams: { name },
  verifyParams: { name },
})

/** null: an algorithm this tool can't check (not a broken signature). */
const getKeySpec = (
  algorithm: number,
  key: Uint8Array,
): KeySpec | null | 'unsupported' => {
  switch (algorithm) {
    case 5:
    case 7:
      return rsaSpec(key, 'SHA-1')
    case 8:
      return rsaSpec(key, 'SHA-256')
    case 10:
      return rsaSpec(key, 'SHA-512')
    case 13:
      return ecdsaSpec(key, 'P-256', 'SHA-256')
    case 14:
      return ecdsaSpec(key, 'P-384', 'SHA-384')
    case 15:
      return eddsaSpec(key, 'Ed25519')
    case 16:
      return eddsaSpec(key, 'Ed448')
    default:
      return 'unsupported'
  }
}

const importKey = (spec: KeySpec) =>
  spec.format === 'jwk'
    ? crypto.subtle.importKey(
        'jwk',
        spec.keyData as JsonWebKey,
        spec.importParams,
        false,
        ['verify'],
      )
    : crypto.subtle.importKey(
        'raw',
        toBufferSource(spec.keyData as Uint8Array),
        spec.importParams,
        false,
        ['verify'],
      )

const isNotSupportedError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'NotSupportedError'

/**
 * Verifies a DNSSEC signature with WebCrypto. A browser without an algorithm
 * (Ed448 everywhere, Ed25519 on older engines) reports `unsupported` rather
 * than `invalid`, so the UI never blames the zone for the browser's gap.
 */
export const verifyDnssecSignature = async ({
  algorithm,
  publicKey,
  data,
  signature,
}: VerifyParams): Promise<CryptoVerdict> => {
  const spec = getKeySpec(algorithm, publicKey)
  if (spec === 'unsupported') return 'unsupported'
  if (spec === null) return 'invalid'

  return fromPromise(
    importKey(spec).then((key) =>
      crypto.subtle.verify(
        spec.verifyParams,
        key,
        toBufferSource(signature),
        toBufferSource(data),
      ),
    ),
    (error) => error,
  ).match(
    (isValid): CryptoVerdict => (isValid ? 'valid' : 'invalid'),
    (error): CryptoVerdict =>
      isNotSupportedError(error) ? 'unsupported' : 'invalid',
  )
}

const DIGEST_HASHES: Readonly<Record<number, string>> = {
  1: 'SHA-1',
  2: 'SHA-256',
  4: 'SHA-384',
}

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index])

/** Checks a DS digest over `owner name ‖ DNSKEY RDATA` (RFC 4034 §5.1.4). */
export const verifyDsDigest = async ({
  digestType,
  data,
  digest,
}: {
  readonly digestType: number
  readonly data: Uint8Array
  readonly digest: Uint8Array
}): Promise<CryptoVerdict> => {
  const hash = DIGEST_HASHES[digestType]
  if (!hash) return 'unsupported'
  const computed = new Uint8Array(
    await crypto.subtle.digest(hash, toBufferSource(data)),
  )
  return equalBytes(computed, digest) ? 'valid' : 'invalid'
}
