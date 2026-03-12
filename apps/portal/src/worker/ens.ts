import { getRecords } from '@ensdomains/ensjs/public'
import { getOwner as getOwnerV1 } from '@ensdomains/ensjs/public/v1'
import { getOwner as getOwnerV2 } from '@ensdomains/ensjs/public/v2'
import { zeroAddress } from 'viem'
import { parseAvatarRecord } from 'viem/ens'

import {
  createL1Client,
  createL2Client,
  type L1Client,
  type L2Client,
  v2EthRegistry,
} from './clients'

export interface EnsData {
  avatar: string | null
  description: string | null
  owner: string | null
}

export async function resolveAvatarDataUri(
  client: L1Client,
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

export async function resolveOwner(
  client: L1Client,
  namechainClient: L2Client,
  name: string,
): Promise<string | null> {
  const v1Owner = await getOwnerV1(client, { name }).catch(() => null)
  if (v1Owner?.owner) return v1Owner.owner

  try {
    const labels = name.split('.')
    const v2Owner = await getOwnerV2(namechainClient, {
      label: labels[0],
      registryAddress: v2EthRegistry,
    })
    if (v2Owner && v2Owner !== zeroAddress) return v2Owner
  } catch {
    // v2 lookup failed
  }

  return null
}

export async function fetchEnsData(env: Env, name: string): Promise<EnsData> {
  const client = createL1Client(env)
  const namechainClient = createL2Client(env)
  try {
    const [records, owner] = await Promise.all([
      getRecords(client, {
        name,
        texts: ['avatar', 'description'],
      }).catch(() => null),
      resolveOwner(client, namechainClient, name),
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
