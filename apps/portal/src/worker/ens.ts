import { getRecords } from '@ensdomains/ensjs/public'
import { parseAvatarRecord } from 'viem/ens'

import { resolveEnsOwner } from '@/utils/ens/resolveEnsOwner'
import { createClient, type EnsClient } from './clients'

export interface EnsData {
  avatar: string | null
  description: string | null
  owner: string | null
}

/** Abort the avatar fetch if the upstream is slow/hanging. */
const AVATAR_FETCH_TIMEOUT_MS = 20_000
/** Cap the avatar payload to avoid memory-exhaustion / amplification abuse. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024

/**
 * Base64-encode bytes via the runtime's native `btoa`.
 *
 * `btoa` takes a binary string, so we build one in chunks with
 * `String.fromCharCode.apply` rather than concatenating per byte (which would
 * allocate O(n) intermediate strings for multi-MB avatars).
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000 // 32K args — stays under the call-stack arg limit
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    )
  }
  return btoa(binary)
}

/** Read a response body into a buffer, aborting once `maxBytes` is exceeded. */
async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
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

    // On-chain avatars (data:/base64 SVGs etc.) are already inline — pass them
    // through without re-fetching (fetching a huge data: URI is itself abusable).
    // Still enforce the image/* requirement on the embedded MIME type.
    if (url.startsWith('data:')) {
      return url.startsWith('data:image/') ? url : null
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type')
    // Only embed actual images; reject anything else the upstream returns,
    // including responses that omit Content-Type entirely.
    if (!contentType?.startsWith('image/')) return null

    const bytes = await readCapped(res, AVATAR_MAX_BYTES)
    if (!bytes) return null

    return `data:${contentType};base64,${bytesToBase64(bytes)}`
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
