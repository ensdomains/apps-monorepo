export type ENStateResponse = {
  name: string
  address?: string
  avatar?: string
  display?: string
  records: {
    'com.twitter'?: string
    'com.discord'?: string
    'com.github'?: string
    url?: string
    location?: string
    email?: string
    description?: string
  }
}

export const getProfile = async (name: string) => {
  const response = await fetch(`https://enstate.rs/n/${name}`)

  if (!response.ok) {
    throw new Error('Failed to fetch profile')
  }

  const data = (await response.json()) as ENStateResponse

  data.avatar = data.avatar?.replace(
    'https://ipfs.io/ipfs/',
    'https://ipfs.euc.li/ipfs/',
  )

  return data
}
