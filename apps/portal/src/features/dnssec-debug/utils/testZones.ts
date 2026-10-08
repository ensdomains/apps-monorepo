/**
 * Test-only: a miniature signed DNS hierarchy (`.` → `xyz` → `example.xyz`)
 * built with real WebCrypto keys, served through a fake `DnsQueryFn`. Each
 * scenario overrides pieces of it to break one link of the chain.
 */
import {
  type DnsResponse,
  type RecordAnswer,
  SignedSet,
} from '@ensdomains/dnsprovejs'
import { bytesToHex, concatBytes } from 'viem'
import type {
  DnskeyAnswer,
  DnsQueryFn,
  DsAnswer,
  DsInfo,
  RrsigAnswer,
  TxtAnswer,
} from '../types'
import {
  computeKeyTag,
  encodeDnskeyRdata,
  encodeDnsName,
  normalizeDnsName,
} from './wire'

export const NOW = 1_800_000_000
const DAY = 24 * 60 * 60

export type TestKey = {
  readonly record: DnskeyAnswer
  readonly privateKey: CryptoKey
  readonly algorithm: 8 | 13
}

const toBuffer = (bytes: Uint8Array) => Buffer.from(bytes)

const base64UrlToBytes = (value: string) =>
  Uint8Array.from(
    Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
  )

const dnskey = (
  zone: string,
  algorithm: number,
  key: Uint8Array,
): DnskeyAnswer => ({
  name: zone,
  type: 'DNSKEY',
  class: 'IN',
  ttl: 3600,
  data: { flags: 257, algorithm, key: toBuffer(key) },
})

export const createEcdsaKey = async (zone: string): Promise<TestKey> => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  return {
    record: dnskey(zone, 13, raw.subarray(1)),
    privateKey: pair.privateKey,
    algorithm: 13,
  }
}

const createRsaKey = async (zone: string): Promise<TestKey> => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 1024,
      publicExponent: Uint8Array.of(1, 0, 1),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const exponent = base64UrlToBytes(jwk.e ?? '')
  const modulus = base64UrlToBytes(jwk.n ?? '')
  const key = concatBytes([Uint8Array.of(exponent.length), exponent, modulus])
  return {
    record: dnskey(zone, 8, key),
    privateKey: pair.privateKey,
    algorithm: 8,
  }
}

export type SignOptions = {
  readonly inception?: number
  readonly expiration?: number
  readonly labels?: number
  /** Sign over this owner instead (e.g. `*.example.xyz` for a wildcard). */
  readonly signedOwner?: string
}

export const sign = async (
  records: readonly RecordAnswer[],
  key: TestKey,
  options: SignOptions = {},
): Promise<RrsigAnswer> => {
  const owner = records[0].name
  const rrsig: RrsigAnswer = {
    name: owner,
    type: 'RRSIG',
    class: 'IN',
    ttl: 3600,
    data: {
      typeCovered: records[0].type,
      algorithm: key.algorithm,
      labels:
        options.labels ??
        (normalizeDnsName(owner) === '.'
          ? 0
          : normalizeDnsName(owner).split('.').length),
      originalTTL: 3600,
      expiration: options.expiration ?? NOW + 30 * DAY,
      inception: options.inception ?? NOW - DAY,
      keyTag: computeKeyTag(key.record),
      signersName: key.record.name,
      signature: toBuffer(new Uint8Array()),
    },
  }
  const data = new SignedSet(
    records.map((record) => ({
      ...record,
      name: options.signedOwner ?? record.name,
    })),
    rrsig,
  ).toWire(true)
  const params =
    key.algorithm === 13
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : { name: 'RSASSA-PKCS1-v1_5' }
  const signature = new Uint8Array(
    await crypto.subtle.sign(params, key.privateKey, new Uint8Array(data)),
  )
  return { ...rrsig, data: { ...rrsig.data, signature: toBuffer(signature) } }
}

export const makeDs = async (key: TestKey): Promise<DsAnswer> => {
  const data = concatBytes([
    encodeDnsName(key.record.name),
    encodeDnskeyRdata(key.record),
  ])
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new Uint8Array(data)),
  )
  return {
    name: key.record.name,
    type: 'DS',
    class: 'IN',
    ttl: 3600,
    data: {
      keyTag: computeKeyTag(key.record),
      algorithm: key.algorithm,
      digestType: 2,
      digest: toBuffer(digest),
    },
  }
}

const toAnchor = (ds: DsAnswer): DsInfo => ({
  keyTag: ds.data.keyTag,
  algorithm: ds.data.algorithm,
  digestType: ds.data.digestType,
  digest: bytesToHex(ds.data.digest),
})

export const txt = (owner: string, value: string): TxtAnswer => ({
  name: owner,
  type: 'TXT',
  class: 'IN',
  ttl: 300,
  data: [toBuffer(new TextEncoder().encode(value))],
})

const soa = (zone: string): RecordAnswer => ({
  name: zone,
  type: 'SOA',
  class: 'IN',
  ttl: 3600,
  data: {
    mname: `ns.${zone}`,
    rname: `hostmaster.${zone}`,
    serial: 1,
    refresh: 3600,
    retry: 600,
    expire: 86400,
    minimum: 300,
  },
})

export const answer = (answers: readonly RecordAnswer[]): DnsResponse => ({
  type: 'response',
  rcode: 'NOERROR',
  answers: [...answers],
})

export const negative = (
  zone: string,
  rcode: 'NOERROR' | 'NXDOMAIN' = 'NOERROR',
): DnsResponse => ({
  type: 'response',
  rcode,
  answers: [],
  authorities: [soa(zone)],
})

export const ADDRESS = '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A'

export type TestHierarchy = {
  readonly keys: {
    readonly root: TestKey
    readonly xyz: TestKey
    readonly example: TestKey
  }
  readonly anchors: readonly DsInfo[]
  /** `name TYPE` → response served with checking disabled. */
  readonly responses: Map<string, DnsResponse>
  /** `name TYPE` → response served to validating queries; defaults to AD set. */
  readonly validated: Map<string, DnsResponse>
}

export const createTestHierarchy = async (): Promise<TestHierarchy> => {
  const [root, xyz, example] = await Promise.all([
    createRsaKey('.'),
    createEcdsaKey('xyz'),
    createEcdsaKey('example.xyz'),
  ])
  const [rootDs, xyzDs, exampleDs] = await Promise.all([
    makeDs(root),
    makeDs(xyz),
    makeDs(example),
  ])
  const ensRecord = txt('_ens.example.xyz', `a=${ADDRESS}`)
  const ens1Record = txt('example.xyz', `ENS1 dnsname.ens.eth ${ADDRESS}`)

  const responses = new Map<string, DnsResponse>([
    ['. DNSKEY', answer([root.record, await sign([root.record], root)])],
    ['xyz DS', answer([xyzDs, await sign([xyzDs], root)])],
    ['xyz DNSKEY', answer([xyz.record, await sign([xyz.record], xyz)])],
    ['example.xyz DS', answer([exampleDs, await sign([exampleDs], xyz)])],
    [
      'example.xyz DNSKEY',
      answer([example.record, await sign([example.record], example)]),
    ],
    [
      '_ens.example.xyz TXT',
      answer([ensRecord, await sign([ensRecord], example)]),
    ],
    [
      'example.xyz TXT',
      answer([ens1Record, await sign([ens1Record], example)]),
    ],
  ])
  return {
    keys: { root, xyz, example },
    anchors: [toAnchor(rootDs)],
    responses,
    validated: new Map(),
  }
}

const AUTHENTIC_DATA = 1 << 5

export const createTestQuery =
  (hierarchy: TestHierarchy): DnsQueryFn =>
  async ({ name, type, checkingDisabled }) => {
    const key = `${normalizeDnsName(name)} ${type}`
    if (!checkingDisabled && hierarchy.validated.has(key)) {
      return hierarchy.validated.get(key) as DnsResponse
    }
    const response = hierarchy.responses.get(key) ?? negative('example.xyz')
    return checkingDisabled
      ? response
      : { ...response, flags: (response.flags ?? 0) | AUTHENTIC_DATA }
  }
