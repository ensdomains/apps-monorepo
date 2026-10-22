/** Diagnostic provenance, never an authorization check or delivery target. */
export const getPushRegistrationMetadata = async (
  originHeader: string | undefined,
  vapidPublicKey: string | undefined,
) => {
  let origin: string | null = null
  if (originHeader) {
    try {
      const url = new URL(originHeader)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        origin = url.origin
      }
    } catch {
      // Non-browser clients may omit Origin or send an invalid value.
    }
  }

  let vapidKeyId: string | null = null
  if (vapidPublicKey) {
    // Hash the decoded key so padded/unpadded base64url representations agree.
    const keyBytes = Uint8Array.from(
      atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')),
      (character) => character.charCodeAt(0),
    )
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', keyBytes),
    )
    // A 128-bit identifier keeps rotation diagnostics compact (22 characters).
    vapidKeyId = btoa(String.fromCharCode(...digest.subarray(0, 16)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  return { origin, vapidKeyId }
}
