import { concatBytes } from 'viem'
import type { DnskeyAnswer } from '../types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Lowercase, no trailing dot; the root zone is `.`. */
export const normalizeDnsName = (name: string): string => {
  const trimmed = name.trim().toLowerCase().replace(/\.+$/, '')
  return trimmed === '' ? '.' : trimmed
}

export const isSameDnsName = (a: string, b: string): boolean =>
  normalizeDnsName(a) === normalizeDnsName(b)

/** The zone one label up, or null for the root. */
export const getParentZone = (zone: string): string | null => {
  const name = normalizeDnsName(zone)
  if (name === '.') return null
  const dot = name.indexOf('.')
  return dot === -1 ? '.' : name.slice(dot + 1)
}

/** True when `ancestor` is a strict parent domain of `name`. */
export const isProperAncestor = (ancestor: string, name: string): boolean => {
  const a = normalizeDnsName(ancestor)
  const n = normalizeDnsName(name)
  if (a === n) return false
  return a === '.' || n.endsWith(`.${a}`)
}

/** Every zone from the root down to `name`, root first. */
export const getAncestry = (name: string): readonly string[] => {
  const normalized = normalizeDnsName(name)
  if (normalized === '.') return ['.']
  const labels = normalized.split('.')
  return [
    '.',
    ...labels.map((_, index) =>
      labels.slice(labels.length - 1 - index).join('.'),
    ),
  ]
}

/** Labels in a name, not counting the root (RFC 4034 §3.1.3). */
export const countLabels = (name: string): number => {
  const normalized = normalizeDnsName(name)
  return normalized === '.' ? 0 : normalized.split('.').length
}

/** Uncompressed wire form of a name (RFC 1035 §3.1), lowercased. */
export const encodeDnsName = (name: string): Uint8Array => {
  const normalized = normalizeDnsName(name)
  if (normalized === '.') return Uint8Array.of(0)
  const labels = normalized.split('.').map((label) => textEncoder.encode(label))
  return concatBytes([
    ...labels.flatMap((label) => [Uint8Array.of(label.length), label]),
    Uint8Array.of(0),
  ])
}

/** DNSKEY RDATA: flags, protocol (always 3), algorithm, public key. */
export const encodeDnskeyRdata = (key: DnskeyAnswer): Uint8Array =>
  concatBytes([
    Uint8Array.of(
      (key.data.flags >> 8) & 0xff,
      key.data.flags & 0xff,
      3,
      key.data.algorithm,
    ),
    key.data.key,
  ])

/** The key tag of a DNSKEY (RFC 4034 appendix B). */
export const computeKeyTag = (key: DnskeyAnswer): number => {
  const rdata = encodeDnskeyRdata(key)
  let sum = 0
  for (let i = 0; i < rdata.length; i++) {
    sum += i & 1 ? rdata[i] : rdata[i] << 8
  }
  sum += (sum >> 16) & 0xffff
  return sum & 0xffff
}

const ZONE_KEY_FLAG = 0x0100
const SECURE_ENTRY_POINT_FLAG = 0x0001

export const isZoneKey = (key: DnskeyAnswer): boolean =>
  (key.data.flags & ZONE_KEY_FLAG) !== 0

export const isSecureEntryPoint = (key: DnskeyAnswer): boolean =>
  (key.data.flags & SECURE_ENTRY_POINT_FLAG) !== 0

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const toBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** TXT RDATA is one or more character-strings; ENS reads them joined. */
export const decodeTxtData = (data: unknown): string => {
  const parts = Array.isArray(data) ? data : [data]
  return parts
    .map((part) =>
      typeof part === 'string'
        ? part
        : part instanceof Uint8Array
          ? textDecoder.decode(part)
          : '',
    )
    .join('')
}
