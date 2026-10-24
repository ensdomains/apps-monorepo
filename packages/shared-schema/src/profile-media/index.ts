import * as v from 'valibot'

export const PROFILE_IMAGE_TYPES = ['image/jpeg'] as const
export type ProfileImageMime = (typeof PROFILE_IMAGE_TYPES)[number]
export type ProfileImageKind = 'avatar' | 'header'
export const MAX_PROFILE_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_PROFILE_UPLOAD_BYTES = 4 * 1024 * 1024 + 16 * 1024
export const PROFILE_UPLOAD_VALIDITY_MS = 5 * 60 * 1000

const address = v.pipe(v.string(), v.regex(/^0x[\da-fA-F]{40}$/))
const hash = v.pipe(v.string(), v.regex(/^0x[\da-fA-F]{64}$/))
export const profileUploadSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  kind: v.picklist(['avatar', 'header']),
  chainId: v.picklist([1, 11155111]),
  service: v.pipe(v.string(), v.maxLength(256)),
  account: address,
  signer: address,
  hash,
  mimeType: v.picklist(PROFILE_IMAGE_TYPES),
  revision: v.pipe(v.string(), v.maxLength(64)),
  expiry: v.pipe(v.string(), v.regex(/^\d{13}$/)),
  dataURL: v.pipe(v.string(), v.maxLength(MAX_PROFILE_UPLOAD_BYTES)),
  sig: v.pipe(v.string(), v.regex(/^0x(?:[\da-fA-F]{2})+$/), v.maxLength(8194)),
})
export type ProfileUploadRequest = v.InferOutput<typeof profileUploadSchema>
export type ProfileUploadMessage = Omit<ProfileUploadRequest, 'dataURL' | 'sig'>

export const profileUploadTypes = {
  Upload: [
    { name: 'name', type: 'string' },
    { name: 'kind', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'service', type: 'string' },
    { name: 'account', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'hash', type: 'bytes32' },
    { name: 'mimeType', type: 'string' },
    { name: 'revision', type: 'string' },
    { name: 'expiry', type: 'string' },
  ],
} as const

export const profileUploadDomain = (chainId: number) =>
  ({
    name: 'Ethereum Name Service Profile Media',
    version: '2',
    chainId,
  }) as const

export const getProfileImagePath = (
  network: 'mainnet' | 'sepolia',
  name: string,
  kind: ProfileImageKind,
) =>
  `${network === 'sepolia' ? '/sepolia' : ''}/${encodeURIComponent(name)}${kind === 'header' ? '/h' : ''}`

export { inspectProfileImage } from './image'
