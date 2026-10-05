import type { DnsResponse } from '@ensdomains/dnsprovejs'
import {
  type DnsResolverId,
  MAX_ZONE_DEPTH,
  ROOT_TRUST_ANCHORS,
} from '../constants'
import type {
  DnskeyAnswer,
  DnsQueryFn,
  DnsQueryType,
  DnssecReport,
  DsInfo,
  ZoneStep,
} from '../types'
import { getAnsweringZone, getResponseCode } from './dnsResponse'
import { evaluateRecord } from './evaluateRecord'
import { evaluateZone } from './evaluateZone'
import {
  getAncestry,
  getParentZone,
  isProperAncestor,
  normalizeDnsName,
} from './wire'

type ZoneResponses = {
  readonly zone: string
  readonly parent: string | null
  readonly dsResponse: DnsResponse | null
  readonly dnskeyResponse: DnsResponse
}

const createCachedQuery = (query: DnsQueryFn) => {
  const cache = new Map<string, Promise<DnsResponse>>()
  return (name: string, type: DnsQueryType): Promise<DnsResponse> => {
    const key = `${name} ${type}`
    const cached = cache.get(key)
    if (cached) return cached
    const response = query({ name, type, checkingDisabled: true })
    // Prefetched lookups may never be awaited (a skipped non-zone label);
    // a rejection there must not surface as unhandled.
    response.catch(() => undefined)
    cache.set(key, response)
    return response
  }
}

/**
 * The parent zone is whoever signs the zone's DS records (or the SOA owner of
 * a negative DS answer) — that respects zone cuts that don't fall on every
 * label. Falls back to stripping one label.
 */
const pickParent = (zone: string, dsResponse: DnsResponse): string | null => {
  const answering = getAnsweringZone(dsResponse)
  return answering && isProperAncestor(answering, zone)
    ? answering
    : getParentZone(zone)
}

/** DS and DNSKEY responses for every zone from the root down to `leafZone`. */
const collectZoneResponses = async (
  leafZone: string,
  query: DnsQueryFn,
): Promise<readonly ZoneResponses[]> => {
  const cachedQuery = createCachedQuery(query)
  // Every ancestor is usually its own zone, so fetch them all up front.
  for (const zone of getAncestry(leafZone)) {
    cachedQuery(zone, 'DNSKEY')
    if (zone !== '.') cachedQuery(zone, 'DS')
  }

  const chain: ZoneResponses[] = []
  let zone: string | null = leafZone
  while (zone !== null && chain.length < MAX_ZONE_DEPTH) {
    const [dsResponse, dnskeyResponse]: [DnsResponse | null, DnsResponse] =
      await Promise.all([
        zone === '.' ? null : cachedQuery(zone, 'DS'),
        cachedQuery(zone, 'DNSKEY'),
      ])
    const parent: string | null = dsResponse
      ? pickParent(zone, dsResponse)
      : null
    chain.unshift({ zone, parent, dsResponse, dnskeyResponse })
    zone = parent
  }
  return chain
}

const evaluateZones = async ({
  responses,
  anchors,
  now,
}: {
  readonly responses: readonly ZoneResponses[]
  readonly anchors: readonly DsInfo[]
  readonly now: number
}) => {
  const steps: ZoneStep[] = []
  const zoneKeys = new Map<string, readonly DnskeyAnswer[]>()
  let parentKeys: readonly DnskeyAnswer[] = []
  // Sequential on purpose: each zone's DS records are signed by its parent's keys.
  for (const zone of responses) {
    const { step, keys } = await evaluateZone({
      ...zone,
      parentKeys,
      anchors,
      now,
    })
    steps.push(step)
    zoneKeys.set(zone.zone, keys)
    parentKeys = keys
  }
  return { steps, zoneKeys }
}

/**
 * The zone the chain has to reach. `_ens.<name>` can be delegated as its own
 * zone, signed below the one answering the name's apex; walking only to the
 * apex signer would never load its keys. The deeper zone's chain passes
 * through both. Only a zone on the path to `_ens.<name>` is followed: anything
 * else claiming to answer for it is not a zone it can live in.
 */
const pickLeafZone = ({
  apexZone,
  ensZone,
  ensOwner,
}: {
  readonly apexZone: string
  readonly ensZone: string | null
  readonly ensOwner: string
}): string =>
  ensZone &&
  isProperAncestor(apexZone, ensZone) &&
  (ensZone === ensOwner || isProperAncestor(ensZone, ensOwner))
    ? ensZone
    : apexZone

const ROOT_ANCHORS: readonly DsInfo[] = ROOT_TRUST_ANCHORS.map((anchor) => ({
  ...anchor,
}))

/**
 * Walks the DNSSEC chain of trust for a DNS name — root, TLD, the name's zone,
 * and `_ens.<name>`'s zone when that is delegated separately — and the two TXT
 * records ENS reads, evaluating every link instead of
 * stopping at the first failure the way a validating resolver (or
 * dnsprovejs) does.
 */
export const walkDnssecChain = async ({
  name,
  resolver,
  query,
  now = Math.floor(Date.now() / 1000),
  anchors = ROOT_ANCHORS,
}: {
  readonly name: string
  readonly resolver: DnsResolverId
  readonly query: DnsQueryFn
  readonly now?: number
  readonly anchors?: readonly DsInfo[]
}): Promise<DnssecReport> => {
  const owner = normalizeDnsName(name)
  const ensOwner = `_ens.${owner}`
  const txt = (recordName: string, checkingDisabled: boolean) =>
    query({ name: recordName, type: 'TXT', checkingDisabled })

  const [offchain, onchain, offchainValidated, onchainValidated] =
    await Promise.all([
      txt(owner, true),
      txt(ensOwner, true),
      txt(owner, false),
      txt(ensOwner, false),
    ])

  const apexZone = getAnsweringZone(offchain) ?? owner
  const ensZone = getAnsweringZone(onchain)
  const responses = await collectZoneResponses(
    pickLeafZone({ apexZone, ensZone, ensOwner }),
    query,
  )
  const { steps, zoneKeys } = await evaluateZones({ responses, anchors, now })

  const shared = { zoneKeys, resolver, now }
  const records = await Promise.all([
    evaluateRecord({
      ...shared,
      purpose: 'onchain',
      fallbackZone: ensZone ?? apexZone,
      owner: ensOwner,
      response: onchain,
      validatedResponse: onchainValidated,
    }),
    evaluateRecord({
      ...shared,
      purpose: 'offchain',
      fallbackZone: apexZone,
      owner,
      response: offchain,
      validatedResponse: offchainValidated,
    }),
  ])

  return {
    name: owner,
    resolver,
    checkedAt: now,
    nameExists: getResponseCode(offchain) !== 'NXDOMAIN',
    zones: steps,
    records,
  }
}
