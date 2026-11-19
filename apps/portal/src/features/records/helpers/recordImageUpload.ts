import type { EnsNetwork } from '@ens-apps/config'
import { type Address, type Hex, sha256 } from 'viem'
import {
  canEditRecord,
  type EditableRecord,
  type EditableTypes,
} from '@/utils/records/editRecordUtils'
import { isCanonicalName } from '@/utils/token/isNormalized'
import {
  MAX_CROPPED_IMAGE_BYTES,
  type RecordImageKind,
} from './recordImageCrop'

const MAINNET_UPLOAD_ORIGIN = 'https://euc.li'
const SEPOLIA_UPLOAD_ORIGIN = 'https://avatar-upload-staging.ens-cf.workers.dev'
const UPLOAD_TIMEOUT_MS = 30_000
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

type RecordImageTarget = {
  readonly name: string
  readonly kind: RecordImageKind
  readonly imageUrl: string
}

export type RecordImageChoice = RecordImageTarget & {
  readonly mode: 'replace' | 'stage'
}

export type PreparedRecordImage = RecordImageTarget & {
  readonly dataURL: string
  readonly hash: string
}

export const getRecordImageKind = ({
  type,
  key,
}: {
  readonly type: string
  readonly key?: string
}): RecordImageKind | undefined =>
  type === 'text' && (key === 'avatar' || key === 'header') ? key : undefined

const isSameRecordImageUrl = (url: string | undefined, canonical: string) =>
  url?.trim() === canonical || url?.trim() === new URL(canonical).href

export const getRecordImageChoice = ({
  name,
  kind,
  savedRecords,
  editableTypes,
  network,
}: {
  readonly name: string
  readonly kind: RecordImageKind
  readonly savedRecords: readonly EditableRecord[]
  readonly editableTypes: EditableTypes
  readonly network: EnsNetwork
}): RecordImageChoice | undefined => {
  if (!isCanonicalName(name)) return undefined

  const path = `${network === 'sepolia' ? '/sepolia' : ''}/${name}${kind === 'header' ? '/h' : ''}`
  const imageUrl = `${network === 'sepolia' ? SEPOLIA_UPLOAD_ORIGIN : MAINNET_UPLOAD_ORIGIN}${path}`
  const record = { type: 'text', key: kind, value: imageUrl } as const
  if (!canEditRecord(editableTypes, record)) return undefined

  const saved = savedRecords.find(
    (record) => record.type === 'text' && record.key === kind,
  )
  const hostedUrl = [imageUrl, `${MAINNET_UPLOAD_ORIGIN}${path}`].find((url) =>
    isSameRecordImageUrl(saved?.value, url),
  )

  if (hostedUrl) return { name, kind, imageUrl: hostedUrl, mode: 'replace' }

  return { name, kind, imageUrl, mode: 'stage' }
}

const readImageData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read the cropped image.'))
    }
    reader.onerror = () =>
      reject(new Error('Could not read the cropped image.'))
    reader.readAsDataURL(file)
  })

export const prepareRecordImage = async (
  { name, kind, imageUrl }: RecordImageTarget,
  file: File,
  readData = readImageData,
): Promise<PreparedRecordImage> => {
  if (file.type !== 'image/jpeg' || file.size === 0) {
    throw new Error('The cropped image must be a JPEG.')
  }
  if (file.size > MAX_CROPPED_IMAGE_BYTES) {
    throw new Error(
      `The cropped image must be ${MAX_CROPPED_IMAGE_BYTES / 1024} KiB or smaller.`,
    )
  }

  const dataURL = await readData(file)
  const bytes = Uint8Array.from(atob(dataURL.split(',')[1] ?? ''), (char) =>
    char.charCodeAt(0),
  )
  return { name, kind, imageUrl, dataURL, hash: sha256(bytes).slice(2) }
}

const getUploadTypedData = (
  { name, kind, hash }: PreparedRecordImage,
  expiry: string,
) =>
  ({
    domain: { name: 'Ethereum Name Service', version: '1' },
    primaryType: 'Upload',
    types: {
      Upload: [
        { name: 'upload', type: 'string' },
        { name: 'expiry', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'hash', type: 'string' },
      ],
    },
    message: { upload: kind, expiry, name, hash },
  }) as const

const signUntilCancelled = async (
  sign: () => Promise<Hex>,
  signal: AbortSignal,
): Promise<Hex> => {
  signal.throwIfAborted()
  let stopListening = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    const cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    stopListening = () => signal.removeEventListener('abort', cancel)
  })
  try {
    return await Promise.race([cancelled, sign()])
  } finally {
    stopListening()
  }
}

export const submitRecordImage = async ({
  upload,
  address,
  now,
  sign,
  put,
  signal,
  assertCurrent,
}: {
  readonly upload: PreparedRecordImage
  readonly address: Address
  readonly now: number
  readonly sign: (
    request: ReturnType<typeof getUploadTypedData>,
  ) => Promise<Hex>
  readonly put: typeof fetch
  readonly signal: AbortSignal
  readonly assertCurrent: () => void
}) => {
  assertCurrent()
  const expiry = String(now + ONE_WEEK_MS)
  const sig = await signUntilCancelled(
    () => sign(getUploadTypedData(upload, expiry)),
    signal,
  )
  assertCurrent()

  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
  const response = await put(upload.imageUrl, {
    method: 'PUT',
    redirect: 'error',
    signal: AbortSignal.any([signal, timeout]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expiry,
      dataURL: upload.dataURL,
      sig,
      unverifiedAddress: address,
    }),
  }).catch((error: unknown) =>
    Promise.reject(
      timeout.aborted
        ? new Error('Upload timed out. Please try again.')
        : error,
    ),
  )

  const body: unknown = await response.json().catch(() => undefined)
  if (
    response.ok &&
    body &&
    typeof body === 'object' &&
    'message' in body &&
    body.message === 'uploaded'
  ) {
    return
  }
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    throw new Error(body.error)
  }
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}.`)
  }
  throw new Error('The image service did not confirm the upload.')
}

export const submitStagedRecordImages = async ({
  uploads,
  submit,
  onUploaded,
  assertCurrent,
}: {
  readonly uploads: readonly PreparedRecordImage[]
  readonly submit: (upload: PreparedRecordImage) => Promise<void>
  readonly onUploaded: (upload: PreparedRecordImage) => void
  readonly assertCurrent: () => void
}) => {
  for (const upload of uploads) {
    assertCurrent()
    await submit(upload)
    onUploaded(upload)
  }
  assertCurrent()
}
