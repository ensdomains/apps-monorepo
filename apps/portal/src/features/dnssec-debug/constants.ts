import { parseAbi } from 'viem'

export const DNS_RESOLVERS = {
  cloudflare: {
    label: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
  },
  google: {
    label: 'Google',
    url: 'https://dns.google/dns-query',
  },
} as const

export type DnsResolverId = keyof typeof DNS_RESOLVERS

export const DEFAULT_DNS_RESOLVER: DnsResolverId = 'cloudflare'

/** RFC 8624 §3.1 recommendations for signing. */
type AlgorithmRecommendation =
  | 'MUST'
  | 'RECOMMENDED'
  | 'MAY'
  | 'NOT RECOMMENDED'
  | 'MUST NOT'

type AlgorithmInfo = {
  readonly name: string
  readonly recommendation: AlgorithmRecommendation
}

/** DNSKEY / RRSIG algorithm numbers (RFC 8624 §3.1). */
export const DNSSEC_ALGORITHMS: Readonly<Record<number, AlgorithmInfo>> = {
  1: { name: 'RSAMD5', recommendation: 'MUST NOT' },
  3: { name: 'DSA', recommendation: 'MUST NOT' },
  5: { name: 'RSASHA1', recommendation: 'NOT RECOMMENDED' },
  6: { name: 'DSA-NSEC3-SHA1', recommendation: 'MUST NOT' },
  7: { name: 'RSASHA1-NSEC3-SHA1', recommendation: 'NOT RECOMMENDED' },
  8: { name: 'RSASHA256', recommendation: 'MUST' },
  10: { name: 'RSASHA512', recommendation: 'NOT RECOMMENDED' },
  12: { name: 'ECC-GOST', recommendation: 'MUST NOT' },
  13: { name: 'ECDSAP256SHA256', recommendation: 'MUST' },
  14: { name: 'ECDSAP384SHA384', recommendation: 'MAY' },
  15: { name: 'ED25519', recommendation: 'RECOMMENDED' },
  16: { name: 'ED448', recommendation: 'MAY' },
}

/** DS digest types (RFC 8624 §3.3). */
export const DS_DIGEST_TYPES: Readonly<Record<number, AlgorithmInfo>> = {
  1: { name: 'SHA-1', recommendation: 'MUST NOT' },
  2: { name: 'SHA-256', recommendation: 'MUST' },
  3: { name: 'GOST R 34.11-94', recommendation: 'MUST NOT' },
  4: { name: 'SHA-384', recommendation: 'MAY' },
}

export const getAlgorithmName = (algorithm: number): string =>
  DNSSEC_ALGORITHMS[algorithm]?.name ?? `Algorithm ${algorithm}`

export const getDigestName = (digestType: number): string =>
  DS_DIGEST_TYPES[digestType]?.name ?? `Digest ${digestType}`

/**
 * The IANA root zone trust anchors (KSK-2017 and KSK-2024), from
 * https://data.iana.org/root-anchors/root-anchors.xml. These are what a
 * validating resolver trusts; the ENS oracle keeps its own copy onchain, which
 * the oracle step checks separately.
 */
export const ROOT_TRUST_ANCHORS = [
  {
    keyTag: 20326,
    algorithm: 8,
    digestType: 2,
    digest:
      '0xe06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d',
  },
  {
    keyTag: 38696,
    algorithm: 8,
    digestType: 2,
    digest:
      '0x683d2d0acb8c9b712a1948b27f741219298d0a450d612c483af444a4c0fb2b16',
  },
] as const

/**
 * Warn when a signature that validates now expires sooner than this. Kept
 * short: online signers (Cloudflare, Route 53) issue ~1-day signatures and
 * refresh them continuously, so a day-long window alone is not a problem.
 */
export const SIGNATURE_EXPIRY_WARNING_SECONDS = 6 * 60 * 60

/** Safety stop for the zone walk — real chains are 3–5 zones deep. */
export const MAX_ZONE_DEPTH = 12

/**
 * `DNSSECImpl` — the oracle the DNS registrar and the gasless DNS resolver
 * verify proofs against. Errors are declared so viem can decode reverts.
 */
export const dnssecOracleAbi = parseAbi([
  'function verifyRRSet((bytes rrset, bytes sig)[] input) view returns (bytes rrs, uint32 inception)',
  'function algorithms(uint8 id) view returns (address)',
  'function digests(uint8 id) view returns (address)',
  'error InvalidLabelCount(bytes name, uint256 labelsExpected)',
  'error SignatureNotValidYet(uint32 inception, uint32 now)',
  'error SignatureExpired(uint32 expiration, uint32 now)',
  'error InvalidClass(uint16 class)',
  'error InvalidRRSet()',
  'error SignatureTypeMismatch(uint16 rrsetType, uint16 sigType)',
  'error InvalidSignerName(bytes rrsetName, bytes signerName)',
  'error InvalidProofType(uint16 proofType)',
  'error ProofNameMismatch(bytes signerName, bytes proofName)',
  'error NoMatchingProof(bytes signerName)',
  'error OffsetOutOfBoundsError(uint256 offset, uint256 length)',
])
