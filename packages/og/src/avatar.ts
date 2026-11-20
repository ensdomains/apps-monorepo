// Lowercase letters and `+` only: satori's unanchored data-URI regex reads the type with `[a-z/+]+`, so anything else could make it parse a different type than we checked.
const OG_AVATAR_TYPE_RE = /^image\/[a-z+]+$/

const OG_AVATAR_DATA_URI_RE =
  /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/]*={0,2})$/

/** Whether a card embeds an avatar of this bare media type: any image but SVG, whose render cost isn't bounded the way a downscaled bitmap's is. */
export function isOgAvatarContentType(contentType: string): boolean {
  return (
    OG_AVATAR_TYPE_RE.test(contentType) && !contentType.startsWith('image/svg')
  )
}

/** The bare media type a card embeds for this `Content-Type` header, or `null` when it embeds none. */
export function ogAvatarMediaType(header: string | null): string | null {
  const type = header?.split(';')[0]?.trim().toLowerCase() ?? ''
  return isOgAvatarContentType(type) ? type : null
}

/** Whether a card embeds this inline avatar: `data:<type>;base64,<payload>` with an accepted type and a payload of at most `maxPayloadChars`. */
export function isOgAvatarDataUri(
  uri: string,
  maxPayloadChars: number,
): boolean {
  const match = OG_AVATAR_DATA_URI_RE.exec(uri)
  return (
    match?.[1] !== undefined &&
    match[2] !== undefined &&
    match[2].length <= maxPayloadChars &&
    isOgAvatarContentType(match[1])
  )
}
