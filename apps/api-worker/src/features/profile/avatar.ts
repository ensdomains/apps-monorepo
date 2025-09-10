import { ALLOWED_IMAGE_TYPES } from './constants'

export const verifyAvatar = async (url?: string) => {
  if (!url) {
    return
  }

  const response = await fetch(url, {
    method: 'HEAD',
  })

  if (!response.ok) {
    return
  }

  const header = response.headers.get('content-type') || ''
  const type = header.split(';')[0]?.trim()

  if (!type || !ALLOWED_IMAGE_TYPES.includes(type)) {
    return
  }

  return url
}
