import type { EnsNetwork } from '@ens-apps/config'
import { type Hex, zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  ALL_EDITABLE_TYPES,
  NO_EDITABLE_TYPES,
} from '@/utils/records/editRecordUtils'
import type { RecordImageKind } from './recordImageCrop'
import {
  assertRecordImageOwnership,
  getRecordImageChoice,
  isMatchingRecordImageChoice,
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
const OTHER_ADDRESS = '0x2345678901234567890123456789012345678901' as const
const HCA_ADDRESS = '0x3456789012345678901234567890123456789012' as const
const SIG: Hex = '0x1234'
const JPEG_DATA_URL = 'data:image/jpeg;base64,YWJj'
const JPEG_HASH =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const choose = (
  kind: RecordImageKind,
  network: EnsNetwork,
  savedUrl?: string,
  editableTypes = ALL_EDITABLE_TYPES,
  overrides?: Partial<Parameters<typeof getRecordImageChoice>[0]>,
) =>
  getRecordImageChoice({
    name: NAME,
    kind,
    network,
    editableTypes,
    savedRecords: savedUrl
      ? [{ type: 'text', key: kind, value: savedUrl }]
      : [],
    ownership: { address: ADDRESS, owner: ADDRESS },
    ...overrides,
  })

const makeUpload = (kind: RecordImageKind = 'avatar'): PreparedRecordImage => ({
  name: NAME,
  kind,
  imageUrl: kind === 'avatar' ? SEPOLIA_AVATAR : `${SEPOLIA_AVATAR}/h`,
  dataURL: JPEG_DATA_URL,
  hash: JPEG_HASH,
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

  it.each([undefined, SEPOLIA_AVATAR])(
    'withholds upload from a resolver role holder without ownership with saved URL %s',
    (savedUrl) => {
      const editable = { ...NO_EDITABLE_TYPES, text: new Set(['avatar']) }
      expect(
        choose('avatar', 'sepolia', savedUrl, editable, {
          ownership: { address: ADDRESS, owner: OTHER_ADDRESS },
        }),
      ).toBeUndefined()
    },
  )

  it('requires the exact owner of an existing child name', () => {
    const name = 'child.alice.eth'
    const childOwner = { address: OTHER_ADDRESS, owner: OTHER_ADDRESS }
    const parentOwner = { ...childOwner, address: ADDRESS }

    expect(
      choose('avatar', 'mainnet', undefined, ALL_EDITABLE_TYPES, {
        name,
        ownership: parentOwner,
      }),
    ).toBeUndefined()
    expect(
      choose('avatar', 'mainnet', undefined, ALL_EDITABLE_TYPES, {
        name,
        ownership: childOwner,
      }),
    ).toEqual({
      name,
      mode: 'stage',
      kind: 'avatar',
      imageUrl: 'https://euc.li/child.alice.eth',
    })
  })

  it.each([zeroAddress, '0x1234'] as const)(
    'withholds upload when the reported name owner is %s',
    (owner) => {
      expect(
        choose('avatar', 'mainnet', undefined, ALL_EDITABLE_TYPES, {
          ownership: { owner, address: owner },
        }),
      ).toBeUndefined()
    },
  )

  it.each([
    [HCA_ADDRESS, ADDRESS, 'replace'],
    [OTHER_ADDRESS, ADDRESS, undefined],
    [HCA_ADDRESS, OTHER_ADDRESS, undefined],
  ] as const)(
    'scopes HCA verification to account %s and signer %s',
    (owner, address, mode) => {
      const ownership = {
        owner,
        address,
        verifiedHca: { owner: HCA_ADDRESS, signer: ADDRESS },
      }
      expect(
        choose('header', 'mainnet', MAINNET_HEADER, ALL_EDITABLE_TYPES, {
          ownership,
        })?.mode,
      ).toBe(mode)
    },
  )
})

describe('assertRecordImageOwnership', () => {
  it('checks the current name owner without querying HCA verification for a direct owner', async () => {
    const readNameOwner = vi.fn(async () => ADDRESS)
    const readVerifiedHca = vi.fn(async () => undefined)
    await expect(
      assertRecordImageOwnership({
        owner: ADDRESS,
        address: ADDRESS,
        readNameOwner,
        readVerifiedHca,
      }),
    ).resolves.toBeUndefined()
    expect(readNameOwner).toHaveBeenCalledOnce()
    expect(readVerifiedHca).not.toHaveBeenCalled()
  })

  it.each([undefined, OTHER_ADDRESS])(
    'rejects when the current owner is %s instead of the owner in the editor',
    async (currentOwner) => {
      const readVerifiedHca = vi.fn(async () => ({
        owner: HCA_ADDRESS,
        signer: ADDRESS,
      }))
      await expect(
        assertRecordImageOwnership({
          owner: HCA_ADDRESS,
          address: ADDRESS,
          readNameOwner: async () => currentOwner,
          readVerifiedHca,
        }),
      ).rejects.toThrow(/name owner changed or could not be verified/)
      expect(readVerifiedHca).not.toHaveBeenCalled()
    },
  )

  it('requires current proof for a standalone HCA signer', async () => {
    const readVerifiedHca = vi
      .fn<Parameters<typeof assertRecordImageOwnership>[0]['readVerifiedHca']>()
      .mockResolvedValueOnce({ owner: HCA_ADDRESS, signer: ADDRESS })
      .mockResolvedValueOnce(undefined)
    const params = {
      owner: HCA_ADDRESS,
      address: ADDRESS,
      readNameOwner: async () => HCA_ADDRESS,
      readVerifiedHca,
    }
    await expect(assertRecordImageOwnership(params)).resolves.toBeUndefined()
    await expect(assertRecordImageOwnership(params)).rejects.toThrow(
      /verify this wallet as the signer/,
    )
  })
})

describe('isMatchingRecordImageChoice', () => {
  it('rejects a staged upload once the record is already hosted at its URL', () => {
    const choice = choose('avatar', 'sepolia', SEPOLIA_AVATAR)
    expect(isMatchingRecordImageChoice(choice, makeUpload(), 'stage')).toBe(
      false,
    )
    expect(isMatchingRecordImageChoice(choice, makeUpload(), 'replace')).toBe(
      true,
    )
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
    checkEligibility: vi.fn(async () => {}),
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

  it.each([
    ['before signing', 0],
    ['after signing', 1],
  ] as const)(
    'blocks upload when eligibility is lost %s',
    async (_phase, signatureCount) => {
      const params = setup()
      params.checkEligibility.mockRejectedValue(new Error('Ownership changed'))
      if (signatureCount === 1)
        params.checkEligibility.mockResolvedValueOnce(undefined)

      await expect(submitRecordImage(params)).rejects.toThrow(
        'Ownership changed',
      )
      expect(params.sign).toHaveBeenCalledTimes(signatureCount)
      expect(params.put).not.toHaveBeenCalled()
    },
  )

  it('settles on cancellation while waiting for the ownership recheck', async () => {
    const params = setup()
    const controller = new AbortController()
    params.checkEligibility
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => {
        controller.abort()
        return new Promise<void>(() => {})
      })

    await expect(
      submitRecordImage({ ...params, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
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
    await vi.waitFor(() => expect(params.sign).toHaveBeenCalledOnce())
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
