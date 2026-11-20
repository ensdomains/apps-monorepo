/** Whether a card embeds an avatar of this content type: any image but SVG, whose render cost isn't bounded the way a downscaled bitmap's is. */
export function isOgAvatarContentType(contentType: string): boolean {
  return (
    contentType.startsWith('image/') &&
    !contentType.toLowerCase().startsWith('image/svg')
  )
}

/** {@link isOgAvatarContentType} for an inline `data:` URI, judged by the type it declares. */
export function isOgAvatarDataUri(uri: string): boolean {
  return (
    uri.startsWith('data:') && isOgAvatarContentType(uri.slice('data:'.length))
  )
}
