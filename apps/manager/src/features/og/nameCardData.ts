import { getRecords } from '@ensdomains/ensjs/public'
import { getAddress, isAddress, zeroAddress } from 'viem'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { publicClient } from '@/lib/wagmi'
import type { NameOgCard } from './card'

const ETH_COIN_TYPE = 60

/**
 * Cap on the avatar bytes embedded in a card.
 *
 * The avatar is the one input to the render whose size someone else picks, and
 * satori decodes it into a WASM heap that never shrinks — a card without an
 * avatar beats an isolate that runs out of memory rendering one.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Base64-encode bytes without allocating a string per byte. */
function bytesToBase64(bytes: Uint8Array): string {
  // 32K arguments per call — comfortably under the call-stack argument limit.
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunkSize) as unknown as number[],
    )
  }

  return btoa(binary)
}

/**
 * Fetch a name's avatar as a `data:` URI.
 *
 * Dereferencing the raw `avatar` record would mean following `ipfs://` and
 * `eip155:` URIs out to whatever host they name; the metadata service already
 * does that resolution for the app's own avatars, so the card asks it instead
 * and never fetches an attacker-chosen origin itself.
 */
async function fetchAvatarDataUri(name: string): Promise<string | null> {
  try {
    const response = await fetch(buildNameAvatarUrl(name))
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null

    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > AVATAR_MAX_BYTES) return null

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > AVATAR_MAX_BYTES) return null

    return `data:${contentType};base64,${bytesToBase64(bytes)}`
  } catch {
    return null
  }
}

function normalizeAddress(value: string | undefined): string | null {
  if (!value || !isAddress(value)) return null

  const address = getAddress(value)

  return address.toLowerCase() === zeroAddress ? null : address
}

/**
 * Read what a name's card is drawn from: its theme, its avatar and the ETH
 * mainnet address it resolves to.
 *
 * A name that resolves to nothing still gets a card — the themed, address-less
 * variant — so a resolution failure degrades the card rather than failing it.
 */
export async function fetchNameOgCard(name: string): Promise<NameOgCard> {
  const records = await getRecords(publicClient, {
    coins: [ETH_COIN_TYPE],
    ignoreInvalidCoinTypes: true,
    name,
    texts: ['avatar', 'theme'],
  }).catch(() => null)

  const textRecord = (key: string): string | undefined =>
    records?.texts.find((text) => text.key === key)?.value.trim() || undefined

  return {
    address: normalizeAddress(
      records?.coins.find((coin) => coin.coinType === ETH_COIN_TYPE)?.value,
    ),
    avatar: textRecord('avatar') ? await fetchAvatarDataUri(name) : null,
    name,
    themeColor: textRecord('theme') ?? null,
  }
}
