import { getRecords } from '@ensdomains/ensjs/public'
import { parseAvatarRecord } from 'viem/ens'

import { resolveEnsOwner } from '@/utils/ens/resolveEnsOwner'
import { createClient, type EnsClient } from './clients'

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
 * Resolve the owner of an ENS name (V2 subname-aware, with V1 fallback).
 *
 * Thin wrapper over the shared {@link resolveEnsOwner} used by the React app
 * (useEnsOwner), returning just the owner address (or `null`) for OG rendering.
 */
export async function resolveOwner(
  client: EnsClient,
  name: string,
): Promise<string | null> {
  const result = await resolveEnsOwner(client, name).catch(() => null)
  return result ? result.owner : null
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
