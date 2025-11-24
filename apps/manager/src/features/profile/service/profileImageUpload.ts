import { mutationOptions } from '@tanstack/react-query'
import { sha256 } from 'viem'
import type { EventFrom } from 'xstate'
import type { imageSelectionMachine } from '@/features/profile/machines/imageSelection'

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

type ImageSelectionEvent = EventFrom<typeof imageSelectionMachine>

const getChainName = (chainId: number | null | undefined) => {
  if (!chainId || chainId === 1) return 'mainnet'
  // Default to sepolia for non-mainnet in this app
  return 'sepolia'
}

export interface UploadImageMutationOptionsArgs {
  type: ImageType
  name?: string
  uploadFile: File | null
  isConnected: boolean
  address?: string
  chainId: number | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedDataAsync: (args: any) => Promise<string>
  onImageChange: (imageUrl: string) => void
  setOpen: (open: boolean) => void
  setUploadFile: (file: File | null) => void
  setUploadPreviewUrl: (url: string | null) => void
  send: (event: ImageSelectionEvent) => void
}

export const uploadImageMutationOptions = ({
  type,
  name,
  uploadFile,
  isConnected,
  address,
  chainId,
  signTypedDataAsync,
  onImageChange,
  setOpen,
  setUploadFile,
  setUploadPreviewUrl,
  send,
}: UploadImageMutationOptionsArgs) =>
  mutationOptions({
    mutationFn: async () => {
      if (!name) throw new Error('Name is required to upload an image')
      if (!uploadFile) throw new Error('No image selected for upload')
      if (!isConnected || !address)
        throw new Error('Please connect your wallet before uploading an image')

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

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          signal: controller.signal,
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

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`)
        }

        const result = (await response.json()) as
          | { message: string }
          | { error: string; status?: number }

        if ('message' in result && result.message === 'uploaded') {
          // Save Avup endpoint as the text record value
          onImageChange(endpoint)
          setOpen(false)
          setUploadFile(null)
          setUploadPreviewUrl(null)
          send({ type: 'RESET' })
          return
        }

        if ('error' in result) {
          throw new Error(result.error)
        }

        throw new Error('Unknown error')
      } catch (err) {
        clearTimeout(timeoutId)
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Upload timed out. Please try again.')
        }
        throw err
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to upload image'
      send({ type: 'SET_ERROR', error: message })
    },
  })
