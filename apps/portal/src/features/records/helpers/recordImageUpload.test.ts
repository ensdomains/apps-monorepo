import type { EnsNetwork } from '@ens-apps/config'
import type { Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  ALL_EDITABLE_TYPES,
  NO_EDITABLE_TYPES,
} from '@/utils/records/editRecordUtils'
import type { RecordImageKind } from './recordImageCrop'
import {
  getRecordImageChoice,
  getRecordImageKind,
  type PreparedRecordImage,
  prepareRecordImage,
  submitRecordImage,
  submitStagedRecordImages,
} from './recordImageUpload'

const NAME = 'alice.eth'
const SEPOLIA_AVATAR =
  'https://avatar-upload-staging.ens-cf.workers.dev/sepolia/alice.eth'
const MAINNET_HEADER = 'https://euc.li/alice.eth/h'
const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const SIG: Hex = '0x1234'
const JPEG_DATA_URL = 'data:image/jpeg;base64,YWJj'
const JPEG_HASH =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const choose = (
  kind: RecordImageKind,
  network: EnsNetwork,
  savedUrl?: string,
  editableTypes = ALL_EDITABLE_TYPES,
) =>
  getRecordImageChoice({
    name: NAME,
    kind,
    network,
    editableTypes,
    savedRecords: savedUrl
      ? [{ type: 'text', key: kind, value: savedUrl }]
      : [],
  })

const makeUpload = (kind: RecordImageKind = 'avatar'): PreparedRecordImage => ({
  name: NAME,
  kind,
  imageUrl: kind === 'avatar' ? SEPOLIA_AVATAR : `${SEPOLIA_AVATAR}/h`,
  dataURL: JPEG_DATA_URL,
  hash: JPEG_HASH,
})

describe('getRecordImageKind', () => {
  it.each(['avatar', 'header'] as const)(
    'allows the upload affordance for the exact text key %s',
    (key) => {
      expect(getRecordImageKind({ type: 'text', key })).toBe(key)
    },
  )

  it.each(['banner', 'cover', 'HEADER', 'url'])(
    'keeps %s in the raw editor',
    (key) => {
      expect(getRecordImageKind({ type: 'text', key })).toBeUndefined()
    },
  )
})

describe('getRecordImageChoice', () => {
  it.each([
    ['avatar', 'sepolia', SEPOLIA_AVATAR],
    ['avatar', 'sepolia', 'https://euc.li/sepolia/alice.eth'],
    ['header', 'mainnet', MAINNET_HEADER],
  ] as const)(
    'replaces the saved %s on %s without a record write',
    (kind, network, url) => {
      expect(choose(kind, network, url)).toEqual({
        mode: 'replace',
        name: NAME,
        kind,
        imageUrl: url,
      })
    },
  )

  it.each([
    'https://attacker.example/sepolia/alice.eth',
    'https://euc.li@attacker.example/sepolia/alice.eth',
    'https://euc.li/alice.eth',
    'https://euc.li/sepolia/bob.eth',
    'https://euc.li/sepolia/alice.eth/h',
    'https://euc.li/sepolia/alice.eth?target=other',
  ])('stages the configured URL instead of PUTting to %s', (url) => {
    expect(choose('avatar', 'sepolia', url)).toMatchObject({
      mode: 'stage',
      imageUrl: SEPOLIA_AVATAR,
    })
  })

  it('checks the text key permission for staging', () => {
    const editable = { ...NO_EDITABLE_TYPES, text: new Set(['header']) }
    expect(choose('avatar', 'mainnet', undefined, editable)).toBeUndefined()
    expect(
      choose('header', 'mainnet', 'ipfs://header', editable),
    ).toMatchObject({
      mode: 'stage',
      imageUrl: MAINNET_HEADER,
    })
  })

  it('withdraws the upload choice when edit access to a hosted key is lost', () => {
    const editable = { ...NO_EDITABLE_TYPES, text: new Set(['header']) }
    expect(
      choose('avatar', 'sepolia', SEPOLIA_AVATAR, editable),
    ).toBeUndefined()
  })
})

describe('prepareRecordImage', () => {
  it('keeps the JPEG payload and hashes its decoded bytes', async () => {
    const read = async () => JPEG_DATA_URL
    await expect(
      prepareRecordImage(
        makeUpload(),
        new File(['abc'], 'crop.jpg', { type: 'image/jpeg' }),
        read,
      ),
    ).resolves.toEqual(makeUpload())
  })

  it.each([
    [512 * 1024 + 1, 'image/jpeg', /512 KiB/],
    [1, 'image/png', /JPEG/],
    [0, 'image/jpeg', /JPEG/],
  ] as const)(
    'rejects a %i byte %s before reading it',
    async (size, type, error) => {
      const read = vi.fn(async () => JPEG_DATA_URL)
      const file = new File([new Uint8Array(size)], 'crop', { type })
      await expect(
        prepareRecordImage(makeUpload(), file, read),
      ).rejects.toThrow(error)
      expect(read).not.toHaveBeenCalled()
    },
  )
})

describe('submitRecordImage', () => {
  const setup = (body: unknown = { message: 'uploaded' }) => ({
    upload: makeUpload('header'),
    address: ADDRESS,
    now: 1_000,
    sign: vi.fn(async () => SIG),
    put: vi.fn<typeof fetch>(async () => Response.json(body)),
    signal: new AbortController().signal,
    assertCurrent: vi.fn(),
  })

  it('uses the Manager signature and sends the worker a PUT', async () => {
    const params = setup()
    await submitRecordImage(params)
    const message = {
      upload: 'header',
      name: NAME,
      hash: JPEG_HASH,
      expiry: '604801000',
    }
    expect(params.sign).toHaveBeenCalledWith({
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
      message,
    })
    expect(params.put).toHaveBeenCalledWith(
      `${SEPOLIA_AVATAR}/h`,
      expect.objectContaining({
        method: 'PUT',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiry: message.expiry,
          dataURL: JPEG_DATA_URL,
          sig: SIG,
          unverifiedAddress: ADDRESS,
        }),
      }),
    )
  })

  it('blocks the PUT when the identity changes during the wallet prompt', async () => {
    const params = setup()
    params.assertCurrent
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Wallet changed')
      })
    await expect(submitRecordImage(params)).rejects.toThrow('Wallet changed')
    expect(params.sign).toHaveBeenCalledOnce()
    expect(params.put).not.toHaveBeenCalled()
  })

  it('requires the worker to confirm receipt, even with a 200 response', async () => {
    await expect(
      submitRecordImage(setup({ error: 'Not authorized' })),
    ).rejects.toThrow('Not authorized')
  })

  it('settles on cancellation before the wallet responds and ignores late signatures', async () => {
    const params = setup()
    const controller = new AbortController()
    let approve = () => {}
    params.sign.mockImplementation(
      () =>
        new Promise((resolve) => {
          approve = () => resolve(SIG)
        }),
    )
    const status = vi.fn()
    const upload = submitRecordImage({ ...params, signal: controller.signal })
    void upload.then(
      () => status('uploaded'),
      () => status('cancelled'),
    )
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(status).toHaveBeenCalledExactlyOnceWith('cancelled')
    approve()
    await upload.catch(() => undefined)
    expect(params.put).not.toHaveBeenCalled()
  })

  it('shows the worker’s explanation for a rejected upload', async () => {
    const params = setup()
    params.put.mockResolvedValue(
      Response.json({ error: 'Not authorized' }, { status: 403 }),
    )

    await expect(submitRecordImage(params)).rejects.toThrow('Not authorized')
  })
})

describe('submitStagedRecordImages', () => {
  it('stops on failure and reports only completed uploads for retry', async () => {
    const avatar = makeUpload()
    const header = makeUpload('header')
    const submit = vi
      .fn<(upload: PreparedRecordImage) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Upload failed'))
    const onUploaded = vi.fn()
    await expect(
      submitStagedRecordImages({
        uploads: [avatar, header],
        submit,
        onUploaded,
        assertCurrent: () => undefined,
      }),
    ).rejects.toThrow('Upload failed')

    expect(submit.mock.calls).toEqual([[avatar], [header]])
    expect(onUploaded.mock.calls).toEqual([[avatar]])
  })
})
