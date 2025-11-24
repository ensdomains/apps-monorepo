import { TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise } from 'neverthrow'
import { sha256 } from 'viem'

const UPLOAD_TIMEOUT_MS = 30000
const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7

export type ImageType = 'avatar' | 'header'

const fileToDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })

const dataURLToBytes = (dataURL: string) => {
  const [, base64 = ''] = dataURL.split(',')
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes
}

const getChainName = (chainId: number | null | undefined) => {
  if (!chainId || chainId === 1) return 'mainnet'
  // Default to sepolia for non-mainnet in this app
  return 'sepolia'
}

export interface UploadImageInput {
  type: ImageType
  name?: string
  uploadFile: File | null
  isConnected: boolean
  address?: string
  chainId: number | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedDataAsync: (args: any) => Promise<string>
}

export type UploadImageResult = string

export class UploadImageError extends TaggedError('UploadImageError')<{
  message: string
  cause?: unknown
}> {}

export const uploadImage = (input: UploadImageInput) =>
  fromPromise<UploadImageResult, UploadImageError>(
    (async () => {
      const {
        type,
        name,
        uploadFile,
        isConnected,
        address,
        chainId,
        signTypedDataAsync,
      } = input

      if (!name) {
        throw new UploadImageError({
          message: 'Name is required to upload an image',
        })
      }
      if (!uploadFile) {
        throw new UploadImageError({
          message: 'No image selected for upload',
        })
      }
      if (!isConnected || !address) {
        throw new UploadImageError({
          message: 'Please connect your wallet before uploading an image',
        })
      }

      const dataURL = await fileToDataURL(uploadFile)

      const chainName = getChainName(chainId)
      const baseUrlRoot = 'https://euc.li'

      let endpoint: string
      if (type === 'avatar') {
        const baseURL =
          chainName === 'mainnet' ? baseUrlRoot : `${baseUrlRoot}/${chainName}`
        endpoint = `${baseURL}/${name}`
      } else {
        // header
        endpoint =
          chainName === 'mainnet'
            ? `${baseUrlRoot}/${name}/h`
            : `${baseUrlRoot}/${chainName}/${name}/h`
      }

      const hashBytes = sha256(dataURLToBytes(dataURL))
      const urlHash = Array.from(hashBytes)
        .map((b) => b.toString().padStart(2, '0'))
        .join('')
      const expiry = `${Date.now() + ONE_WEEK_MS}`

      const sig = await signTypedDataAsync({
        primaryType: 'Upload',
        domain: {
          name: 'Ethereum Name Service',
          version: '1',
        },
        types: {
          Upload: [
            { name: 'upload', type: 'string' },
            { name: 'expiry', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'hash', type: 'string' },
          ],
        },
        message: {
          upload: type,
          expiry,
          name,
          hash: urlHash,
        },
      })

      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expiry,
            dataURL,
            sig,
            unverifiedAddress: address,
          }),
        })

        if (!response.ok) {
          throw new UploadImageError({
            message: `Upload failed with status ${response.status}`,
          })
        }

        const result = (await response.json()) as
          | { message: string }
          | { error: string; status?: number }

        if ('message' in result && result.message === 'uploaded') {
          return endpoint
        }

        if ('error' in result) {
          throw new UploadImageError({ message: result.error })
        }

        throw new UploadImageError({ message: 'Unknown error' })
      } catch (err) {
        if (err instanceof UploadImageError) {
          throw err
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw new UploadImageError({
            message: 'Upload timed out. Please try again.',
            cause: err,
          })
        }
        throw new UploadImageError({
          message: 'Failed to upload image',
          cause: err,
        })
      }
    })(),
    (e) =>
      e instanceof UploadImageError
        ? e
        : new UploadImageError({
            message:
              e instanceof Error && e.message
                ? e.message
                : 'Failed to upload image',
            cause: e,
          }),
  )
