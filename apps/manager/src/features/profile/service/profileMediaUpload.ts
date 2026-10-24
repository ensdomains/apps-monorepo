import {
  getProfileImagePath,
  inspectProfileImage,
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_UPLOAD_VALIDITY_MS,
  type ProfileUploadMessage,
  profileUploadDomain,
  profileUploadTypes,
} from '@ens-apps/shared-schema/profile-media'
import type { SignTypedDataMutateAsync } from '@wagmi/core/query'
import * as v from 'valibot'
import { type Address, sha256 } from 'viem'
import { normalize } from 'viem/ens'
import { envConfig } from '@/config'
import type { PreparedProfileImageUpload } from './profileImageUpload'

const { profileMediaOrigin } = envConfig

export const getPreparedProfileMediaBytes = (dataURL: string) => {
  const encoded = dataURL.split(',')[1] ?? ''
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
}

export const validatePreparedProfileMedia = (dataURL: string) => {
  const bytes = getPreparedProfileMediaBytes(dataURL)
  if (bytes.byteLength > MAX_PROFILE_IMAGE_BYTES)
    throw new Error('Image must be at most 3 MiB')
  const info = inspectProfileImage(bytes)
  if (!info || !dataURL.startsWith(`data:${info.mimeType};base64,`))
    throw new Error('Please select a valid JPEG image')
  return { bytes, ...info }
}

export const submitProfileMediaUpload = async ({
  upload,
  address,
  account,
  signTypedDataAsync,
}: {
  readonly upload: PreparedProfileImageUpload
  readonly address: string
  readonly account?: Address
  readonly signTypedDataAsync: SignTypedDataMutateAsync<unknown>
}) => {
  if (!profileMediaOrigin)
    throw new Error('Profile image service is not configured')
  if (normalize(upload.name) !== upload.name)
    throw new Error('Image upload requires a normalized name')
  const imageUrl = `${profileMediaOrigin}${getProfileImagePath(envConfig.network, upload.name, upload.kind)}`
  if (upload.imageUrl !== imageUrl)
    throw new Error('Prepared image belongs to a different upload service')
  const metadata = await fetch(`${imageUrl}/meta`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  if (!metadata.ok)
    throw new Error('Unable to read the current image revision. Try again.')
  const { revision } = v.parse(
    v.object({ revision: v.pipe(v.string(), v.maxLength(64)) }),
    await metadata.json(),
  )
  const { bytes, mimeType } = validatePreparedProfileMedia(upload.dataURL)
  const message: ProfileUploadMessage = {
    name: upload.name,
    kind: upload.kind,
    chainId: envConfig.network === 'mainnet' ? 1 : 11155111,
    service: profileMediaOrigin,
    account: account ?? address,
    signer: address,
    hash: sha256(bytes),
    mimeType,
    revision,
    expiry: String(Date.now() + PROFILE_UPLOAD_VALIDITY_MS),
  }
  const sig = await signTypedDataAsync({
    domain: profileUploadDomain(message.chainId),
    types: profileUploadTypes,
    primaryType: 'Upload',
    message: {
      ...message,
      account: message.account as Address,
      signer: address as Address,
      hash: message.hash as `0x${string}`,
      chainId: BigInt(message.chainId),
    },
  })
  const response = await fetch(imageUrl, {
    method: 'PUT',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, dataURL: upload.dataURL, sig }),
  })
  if (response.status === 409)
    throw new Error('This image changed. Save again to sign a fresh upload.')
  if (!response.ok) {
    const result = v.safeParse(
      v.object({ error: v.object({ message: v.string() }) }),
      await response.json().catch(() => null),
    )
    throw new Error(
      result.success
        ? result.output.error.message
        : `Image upload failed (${response.status})`,
    )
  }
  v.parse(
    v.object({ message: v.literal('uploaded'), revision: v.string() }),
    await response.json(),
  )
}
