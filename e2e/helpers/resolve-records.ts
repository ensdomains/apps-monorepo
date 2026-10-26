/**
 * Read a name's records the way a client does: through the UniversalResolver,
 * which finds the name's resolver (V2 after migration) and forwards the call.
 *
 * The owner's PermissionedResolver keys records by name, not node, and reverts
 * on a direct `text(node, key)`, so the UniversalResolver is the only read that
 * works for every record type — and it is what every ENS client sees.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { expect, test } from '@playwright/test'
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  namehash,
  parseAbi,
  stringToBytes,
  toHex,
} from 'viem'
import {
  RESOLVER_ABI,
  recordChecks,
  type V1Records,
} from '../fixtures/v1-records.js'
import { publicClient } from './anvil-client.js'

const UNIVERSAL_RESOLVER = ensL1Contracts[supportedL1Chains.sepolia]
  .ensUniversalResolver.address as Address

const UNIVERSAL_RESOLVER_ABI = parseAbi([
  'function resolve(bytes name, bytes data) view returns (bytes, address)',
])

/** RFC 1035 wire format: each label length-prefixed, then a zero byte. */
export const dnsEncode = (name: string): Hex => {
  const bytes: number[] = []
  for (const label of name.split('.')) {
    const encoded = stringToBytes(label)
    bytes.push(encoded.length, ...encoded)
  }
  bytes.push(0)
  return toHex(new Uint8Array(bytes))
}

export type RecordReadBack = {
  readonly what: string
  readonly want: string
  /** The normalised value, or `reverted: …` when the read failed. */
  readonly got: string
}

/** Each record in `records`, as written and as a client resolves it now. */
export async function resolveRecords(
  name: string,
  records: V1Records,
): Promise<RecordReadBack[]> {
  const dnsName = dnsEncode(name)
  return Promise.all(
    recordChecks(namehash(name), records).map(async (check) => {
      const call = {
        abi: RESOLVER_ABI,
        functionName: check.functionName,
        args: check.args,
      } as never
      try {
        const [data] = await publicClient.readContract({
          address: UNIVERSAL_RESOLVER,
          abi: UNIVERSAL_RESOLVER_ABI,
          functionName: 'resolve',
          args: [dnsName, encodeFunctionData(call)],
        })
        const decoded = decodeFunctionResult({
          ...(call as object),
          data,
        } as never) as unknown
        return {
          what: check.what,
          want: check.want,
          got: check.normalise(decoded),
        }
      } catch (error) {
        const reason = (error as Error).message.split('\n')[0]
        return {
          what: check.what,
          want: check.want,
          got: `reverted: ${reason}`,
        }
      }
    }),
  )
}

/** The resolver the UniversalResolver routes `name` to. */
export async function resolverFor(name: string): Promise<Address> {
  const [, resolver] = await publicClient.readContract({
    address: UNIVERSAL_RESOLVER,
    abi: UNIVERSAL_RESOLVER_ABI,
    functionName: 'resolve',
    args: [
      dnsEncode(name),
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'text',
        args: [namehash(name), 'url'],
      }),
    ],
  })
  return resolver
}

/**
 * Each record in `records` must resolve to exactly what was written. Every
 * mismatch is reported (soft), then the list of records that did not survive.
 */
export async function expectRecordsResolve(
  name: string,
  records: V1Records,
): Promise<void> {
  const readBack = await resolveRecords(name, records)
  // Optional audit evidence: preserves each value, including mismatches, before assertions.
  if (process.env.RECORD_PRESERVATION_EVIDENCE) {
    const directory = process.env.RECORD_PRESERVATION_EVIDENCE
    mkdirSync(directory, { recursive: true })
    appendFileSync(
      join(directory, 'record-readbacks.jsonl'),
      JSON.stringify({
        name,
        test: test.info().title,
        at: new Date().toISOString(),
        block: String(await publicClient.getBlockNumber({ cacheTime: 0 })),
        records: readBack,
      }) + '\n',
    )
  }
  for (const { what, want, got } of readBack)
    expect.soft(got, `${name}: ${what}`).toBe(want)
  expect(
    readBack.filter((r) => r.got !== r.want).map((r) => r.what),
    `${name}: records that did not survive`,
  ).toEqual([])
}
