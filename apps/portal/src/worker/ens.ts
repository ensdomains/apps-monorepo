import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getName, getRecords } from '@ensdomains/ensjs/public'
import type { Address, Hex } from 'viem'
import { getStorageAt } from 'viem/actions'

import { decodeImplementationAddress } from '@/features/resolver/utils/permissionedResolver'
import { resolveEnsOwner } from '@/utils/ens/resolveEnsOwner'
import { resolveAvatarRecord } from './avatar'
import { type AvatarBitmap, downscaleAvatar } from './avatar-image'
import { createClient, type EnsClient } from './clients'
import { safeFetch } from './safe-fetch'

export interface EnsData {
  avatar: string | null
  description: string | null
  owner: string | null
}

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

/** Render an already-downscaled bitmap as the `data:` URI satori embeds. */
function toDataUri({ bytes, contentType }: AvatarBitmap): string {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`
}

/**
 * `data:<mime>;base64,<payload>` — the only inline form we can hand to the
 * Images binding. Anything else (percent-encoded SVG, say) is passed through
 * untouched, which is what happened to every inline avatar before WEB-1218.
 */
const BASE64_DATA_URI_RE = /^data:([^;,]+);base64,(.*)$/s

/**
 * Downscale an on-chain `data:` avatar.
 *
 * These skip {@link safeFetch} entirely, so they also skip its byte cap: the
 * pixel cap from {@link downscaleAvatar} is the only bound on how much bitmap
 * an NFT contract can push into the renderer.
 */
async function inlineAvatarDataUri(
  uri: string,
  images: ImagesBinding | undefined,
): Promise<string> {
  const match = BASE64_DATA_URI_RE.exec(uri)
  if (!match) return uri

  const downscaled = await downscaleAvatar(images, {
    data: match[2],
    contentType: match[1],
    encoding: 'base64',
  })

  return downscaled ? toDataUri(downscaled) : uri
}

/**
 * Resolve an ENS `avatar` text record to an inline `data:` URI for OG rendering.
 *
 * The record is attacker-controlled for any name, and this runs server-side on
 * the worker's egress, so every dereference goes through {@link safeFetch} —
 * see `safe-fetch.ts` for the guards and WEB-672 for the residual risk.
 *
 * `selfHost` is the worker's own host, rejected so an avatar pointing back at
 * `/og/<name>.png` can't make the worker recurse into itself.
 *
 * `images` is the Cloudflare Images binding used to cap the avatar's pixel
 * dimensions (WEB-1218); without it the original bytes are embedded as-is.
 */
export async function resolveAvatarDataUri(
  client: EnsClient,
  avatarRecord: string,
  selfHost?: string,
  images?: ImagesBinding,
): Promise<string | null> {
  try {
    const resolved = await resolveAvatarRecord(client, avatarRecord, selfHost)

    // On-chain avatars (data:/base64 SVGs etc.) are already inline — pass them
    // through without re-fetching (fetching a huge data: URI is itself abusable).
    // Still enforce the image/* requirement on the embedded MIME type.
    if (resolved.kind === 'inline') {
      return resolved.uri.startsWith('data:image/')
        ? inlineAvatarDataUri(resolved.uri, images)
        : null
    }

    const result = await safeFetch(resolved.url, {
      accept: (contentType) => contentType.startsWith('image/'),
      maxBytes: AVATAR_MAX_BYTES,
      selfHost,
    })
    if (!result) return null

    const downscaled = await downscaleAvatar(images, {
      data: result.bytes,
      contentType: result.contentType,
    })

    return toDataUri(downscaled ?? result)
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

/** EIP-1967 implementation slot — mirrors `useIsPermissionedResolver`. */
const EIP1967_IMPLEMENTATION_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

/**
 * Determine whether a resolver is an ENS Permissioned Resolver, so the OG card
 * can render the "Permissioned Resolver" subtitle.
 *
 * Worker-side mirror of {@link useIsPermissionedResolver}: read the EIP-1967
 * implementation slot and compare against the known permissioned-resolver
 * implementation for the chain. Any failure resolves to `false` so the card
 * still renders (just as a plain "Resolver").
 */
export async function fetchIsPermissionedResolver(
  env: Env,
  address: string,
): Promise<boolean> {
  try {
    const client = createClient(env)

    const knownImpl = getChainContractAddress({
      chain: client.chain,
      contract: 'ensPermissionedResolverImpl',
    })?.toLowerCase()
    if (!knownImpl) return false

    const normalized = address.toLowerCase()
    if (normalized === knownImpl) return true

    const slotValue = await getStorageAt(client, {
      address: address as Address,
      slot: EIP1967_IMPLEMENTATION_SLOT,
    })

    const implementation = decodeImplementationAddress(slotValue)
    if (!implementation) return false

    return implementation.toLowerCase() === knownImpl
  } catch {
    return false
  }
}

/**
 * Resolve an address's primary name, for the subtitle on its OG card.
 *
 * L1 default reverse (coin 60) only, forward-verified. The ENSIP-19 walk
 * through the L2 reverse registrars that `usePrimaryName` does costs a round
 * trip per chain, which is more than a card subtitle is worth — an address
 * whose primary name lives only on an L2 renders without one, as does any
 * address whose lookup fails.
 */
export async function fetchPrimaryName(
  env: Env,
  address: string,
): Promise<string | null> {
  try {
    const client = createClient(env)
    const result = await getName(client, { address: address as Address })

    return result?.match ? result.name : null
  } catch {
    return null
  }
}

export async function fetchEnsData(
  env: Env,
  name: string,
  selfHost?: string,
): Promise<EnsData> {
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
      ? await resolveAvatarDataUri(client, avatarRecord, selfHost, env.IMAGES)
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
