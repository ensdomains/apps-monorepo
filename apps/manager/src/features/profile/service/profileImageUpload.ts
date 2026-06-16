import { mutationOptions } from '@tanstack/react-query'
import type { SignTypedDataMutateAsync } from '@wagmi/core/query'
import { sha256 } from 'viem'
import type { EventFrom } from 'xstate'
import { AVATAR_UPLOAD_BASE_URL } from '@/features/profile/constants'
import type { imageSelectionMachine } from '@/features/profile/machines/imageSelection'

const UPLOAD_TIMEOUT_MS = 30000
const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7
const JPEG_QUALITY = 0.9

export type ImageType = 'avatar' | 'header'

const fileToDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })

const dataURLToImage = (dataURL: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = (err) => reject(err)
    image.src = dataURL
  })

const fileToJpegDataURL = async (file: File) => {
  if (file.type === 'image/jpeg') return fileToDataURL(file)

  const dataURL = await fileToDataURL(file)
  const image = await dataURLToImage(dataURL)
  const canvas = document.createElement('canvas')
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const context = canvas.getContext('2d')

  if (!context || !width || !height) {
    throw new Error('Unable to process image for upload')
  }

  canvas.width = width
  canvas.height = height

  // JPEG has no alpha channel, so paint a white background first.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

const dataURLToBytes = (dataURL: string) => {
  const [, base64 = ''] = dataURL.split(',')
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes
}

type ImageSelectionEvent = EventFrom<typeof imageSelectionMachine>

interface UploadRequestParams {
  readonly address: string
  readonly dataURL: string
  readonly endpoint: string
  readonly expiry: string
  readonly sig: string
}

const getChainName = (chainId: number | null | undefined) => {
  if (!chainId || chainId === 1) return 'mainnet'
  // Default to sepolia for non-mainnet in this app
  return 'sepolia'
}

const getUploadEndpoint = ({
  chainId,
  name,
  type,
}: {
  readonly chainId: number | undefined
  readonly name: string
  readonly type: ImageType
}) => {
  const chainName = getChainName(chainId)
  const baseUrlRoot = AVATAR_UPLOAD_BASE_URL

  if (type === 'avatar') {
    const baseURL =
      chainName === 'mainnet' ? baseUrlRoot : `${baseUrlRoot}/${chainName}`
    return `${baseURL}/${name}`
  }

  return chainName === 'mainnet'
    ? `${baseUrlRoot}/${name}/h`
    : `${baseUrlRoot}/${chainName}/${name}/h`
}

const getUploadHash = (dataURL: string) => {
  const hash = sha256(dataURLToBytes(dataURL), 'hex')
  return hash.startsWith('0x') ? hash.slice(2) : hash
}

const signImageUpload = ({
  expiry,
  hash,
  name,
  signTypedDataAsync,
  type,
}: {
  readonly expiry: string
  readonly hash: string
  readonly name: string
  readonly signTypedDataAsync: SignTypedDataMutateAsync<unknown>
  readonly type: ImageType
}) =>
  signTypedDataAsync({
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
      hash,
    },
  })

const uploadSignedImage = async ({
  address,
  dataURL,
  endpoint,
  expiry,
  sig,
}: UploadRequestParams) => {
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
    throw new Error(`Upload failed with status ${response.status}`)
  }

  const result = (await response.json()) as
    | { message: string }
    | { error: string; status?: number }

  if ('message' in result && result.message === 'uploaded') {
    return
  }

  if ('error' in result) {
    throw new Error(result.error)
  }

  throw new Error('Unknown error')
}

export interface UploadImageMutationOptionsArgs {
  readonly type: ImageType
  readonly name?: string
  readonly isConnected: boolean
  readonly address?: string
  readonly chainId: number | undefined
  readonly signTypedDataAsync: SignTypedDataMutateAsync<unknown>
  readonly onImageChange: (imageUrl: string) => void
  readonly onImageUploadComplete?: (imageUrl: string) => void
  readonly setOpen: (open: boolean) => void
  readonly setUploadFile: (file: File | null) => void
  readonly send: (event: ImageSelectionEvent) => void
}

export const uploadImageMutationOptions = ({
  type,
  name,
  isConnected,
  address,
  chainId,
  signTypedDataAsync,
  onImageChange,
  onImageUploadComplete,
  setOpen,
  setUploadFile,
  send,
}: UploadImageMutationOptionsArgs) =>
  mutationOptions({
    mutationFn: async (uploadFile: File) => {
      if (!name) throw new Error('Name is required to upload an image')
      if (!isConnected || !address)
        throw new Error('Please connect your wallet before uploading an image')

      const dataURL = await fileToJpegDataURL(uploadFile)
      const endpoint = getUploadEndpoint({ chainId, name, type })
      const expiry = `${Date.now() + ONE_WEEK_MS}`
      const sig = await signImageUpload({
        expiry,
        hash: getUploadHash(dataURL),
        name,
        signTypedDataAsync,
        type,
      })

      try {
        await uploadSignedImage({ address, dataURL, endpoint, expiry, sig })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Upload timed out. Please try again.')
        }
        throw err
      }

      // Save Avup endpoint as the text record value
      onImageChange(endpoint)
      setOpen(false)
      setUploadFile(null)
      send({ type: 'RESET' })
      onImageUploadComplete?.(endpoint)
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to upload image'
      send({ type: 'SET_ERROR', error: message })
    },
  })
