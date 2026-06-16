import { getRecords } from '@ensdomains/ensjs/public'
import { getOwner as getOwnerV1 } from '@ensdomains/ensjs/public/v1'
import {
  getNameRegistryAddress,
  getOwner as getOwnerV2,
} from '@ensdomains/ensjs/public/v2'
import { type Address, zeroAddress } from 'viem'
import { parseAvatarRecord } from 'viem/ens'

import { createClient, type EnsClient, v2EthRegistry } from './clients'

export interface EnsData {
  avatar: string | null
  description: string | null
  owner: string | null
}

export async function resolveAvatarDataUri(
  client: EnsClient,
  avatarRecord: string,
): Promise<string | null> {
  try {
    const url = await parseAvatarRecord(client, {
      record: avatarRecord,
      gatewayUrls: { ipfs: 'https://ipfs.euc.li' },
    })
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buf = await res.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''),
    )
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

/**
 * Resolve the owner of an .eth name (or subname) from the V2 registry.
 *
 * Walks down from the .eth root to the immediate parent's subregistry, then
 * reads the leaf label's owner. e.g. for `alice.ledgit.eth` look up the
 * subregistry for `ledgit` under .eth, then read `alice` from it. Returns
 * `null` if any parent subregistry is missing or the leaf label is unowned.
 */
async function resolveV2EthOwner(
  client: EnsClient,
  labels: string[],
): Promise<string | null> {
  let registryAddress: Address = v2EthRegistry
  for (let i = labels.length - 2; i >= 1; i--) {
    registryAddress = await getNameRegistryAddress(client, {
      registryAddress,
      label: labels[i],
    })
    if (registryAddress === zeroAddress) return null
  }

  const v2Owner = await getOwnerV2(client, {
    label: labels[0],
    registryAddress,
  })
  return v2Owner && v2Owner !== zeroAddress ? v2Owner : null
}

export async function resolveOwner(
  client: EnsClient,
  name: string,
): Promise<string | null> {
  const labels = name.split('.')
  const tld = labels[labels.length - 1]

  // Try the V2 registry first — but only for names under the .eth TLD.
  // The V2 registry is rooted at .eth, so traversing it for a non-.eth name
  // (e.g. florin.xyz) would incorrectly resolve against the .eth namespace.
  if (tld === 'eth' && labels.length >= 2) {
    const v2Owner = await resolveV2EthOwner(client, labels).catch(() => null)
    if (v2Owner) return v2Owner
  }

  // Fall back to the V1 registry.
  const v1Owner = await getOwnerV1(client, { name }).catch(() => null)
  if (v1Owner?.owner && v1Owner.owner !== zeroAddress) return v1Owner.owner

  return null
}

export async function fetchEnsData(env: Env, name: string): Promise<EnsData> {
  const client = createClient(env)
  try {
    const [records, owner] = await Promise.all([
      getRecords(client, {
        name,
        texts: ['avatar', 'description'],
      }).catch(() => null),
      resolveOwner(client, name),
    ])

    if (!records) {
      return {
        avatar: null,
        description: null,
        owner,
      }
    }

    const avatarRecord =
      records.texts.find((r) => r.key === 'avatar')?.value ?? null

    const avatar = avatarRecord
      ? await resolveAvatarDataUri(client, avatarRecord)
      : null

    return {
      avatar,
      description:
        records.texts.find((r) => r.key === 'description')?.value ?? null,
      owner,
    }
  } catch {
    return { avatar: null, description: null, owner: null }
  }
}
