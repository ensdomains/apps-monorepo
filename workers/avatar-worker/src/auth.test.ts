import { env } from 'cloudflare:workers'
import {
  getDestinationContracts,
  ONCHAIN_ACCOUNT_ID,
} from '@ens-apps/smart-account/providers/rhinestone/manifest'
import { type Address, type Hex, sha256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeUpload } from './auth'
import { jpeg, jpegDataUrl } from './test-utils/jpeg'
import app from './worker'

const rpc = vi.hoisted(() => ({
  owner: '0x2222222222222222222222222222222222222222' as Address,
  resolver: '0x3333333333333333333333333333333333333333' as Address | null,
  code: '0x6000' as Hex | undefined,
  nameBased: false,
  fallback: false,
  fallbackRejectsZero: false,
  supportsText: true,
  supportsInvalidInterface: false,
  invalidInterfaceFails: false,
  invalidInterfaceMalformed: false,
  supportsErc165: true,
  failStage: '' as '' | 'code' | 'interfaces' | 'control' | 'account',
  expired: false,
  fail: false,
  allowedKey: 'avatar',
  allowedSigner: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A' as Address | null,
  hcaOwner: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A' as Address,
}))

// Only the chain boundary is substituted. ENS lookup functions, signature
// recovery, calldata encoding, upload authorization and R2 writes remain real.
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  const abi = actual.parseAbi([
    'function setText(bytes name, string key, string value)',
    'function setText(bytes32 node, string key, string value)',
  ])
  const reads: Record<string, () => unknown> = {
    findExactOwner: () => rpc.owner,
    getExpiry: () =>
      BigInt(Math.floor(Date.now() / 1000) + (rpc.expired ? -1 : 3600)),
    findResolver: () => [rpc.resolver ?? actual.zeroAddress],
    supportsInterface: () => false,
    owner: () => rpc.hcaOwner,
    authorizedOwnerOf: () => rpc.hcaOwner,
    accountId: () => ONCHAIN_ACCOUNT_ID,
    verifyContract: () =>
      getDestinationContracts(11155111).standaloneHcaImplementation,
  }
  const readContract = async ({ functionName }: { functionName: string }) => {
    if (rpc.fail) throw new Error('RPC unavailable')
    const read = reads[functionName]
    if (!read) throw new Error(`Unexpected chain read: ${functionName}`)
    return read()
  }
  const call = async ({
    account,
    to,
    data,
  }: {
    account?: Address
    to?: Address
    data: Hex
  }) => {
    // Returning false forces viem's real EOA signature-recovery path.
    if (to?.toLowerCase() !== rpc.resolver?.toLowerCase())
      return { data: '0x00' }
    if (
      (account === actual.zeroAddress && rpc.failStage === 'control') ||
      (account !== actual.zeroAddress && rpc.failStage === 'account')
    )
      throw new Error('RPC unavailable')
    if (rpc.fail) throw new Error('RPC unavailable')
    if (rpc.fallback) {
      if (rpc.fallbackRejectsZero && account === actual.zeroAddress)
        throw new actual.BaseError('reverted', {
          cause: new actual.ExecutionRevertedError(),
        })
      return { data: '0x' }
    }
    if (!rpc.code) return { data: '0x' }
    const decoded = actual.decodeFunctionData({
      abi: [rpc.nameBased ? abi[0] : abi[1]],
      data,
    })
    const [name, key, value] = decoded.args
    const expectedName = rpc.nameBased
      ? '0x05616c6963650365746800'
      : actual.namehash('alice.eth')
    const suffix = key === 'header' ? '/h' : ''
    if (
      account !== rpc.allowedSigner ||
      key !== rpc.allowedKey ||
      name !== expectedName ||
      value !==
        `https://avatar-worker-staging.ens-cf.workers.dev/sepolia/alice.eth${suffix}`
    )
      throw new actual.BaseError('reverted', {
        cause: new actual.ExecutionRevertedError(),
      })
    return { data: '0x' }
  }
  return {
    ...actual,
    createPublicClient: (
      options: Parameters<typeof actual.createPublicClient>[0],
    ) =>
      actual
        .createPublicClient({
          ...options,
          transport: actual.custom(
            {
              request: async () => {
                throw new Error('Unexpected RPC request')
              },
            },
            { retryCount: 0 },
          ),
        })
        .extend(
          () =>
            ({
              getCode: async () => {
                if (rpc.failStage === 'code') throw new Error('RPC unavailable')
                return rpc.code
              },
              readContract,
              multicall: async ({
                contracts,
              }: {
                contracts: readonly { args: readonly Hex[] }[]
              }) =>
                contracts.map(({ args: [id] }) =>
                  rpc.failStage === 'interfaces'
                    ? { status: 'failure', error: new Error('RPC unavailable') }
                    : id === '0xffffffff' && rpc.invalidInterfaceFails
                      ? {
                          status: 'failure',
                          error: new actual.ContractFunctionExecutionError(
                            rpc.invalidInterfaceMalformed
                              ? new actual.InvalidBytesBooleanError(
                                  Uint8Array.of(2),
                                )
                              : new actual.ContractFunctionRevertedError({
                                  abi: actual.parseAbi([
                                    'function supportsInterface(bytes4) view returns (bool)',
                                  ]),
                                  functionName: 'supportsInterface',
                                  data: '0x',
                                }),
                            {
                              abi: actual.parseAbi([
                                'function supportsInterface(bytes4) view returns (bool)',
                              ]),
                              functionName: 'supportsInterface',
                              args: [id],
                            },
                          ),
                        }
                      : {
                          status: 'success',
                          result:
                            (
                              {
                                '0xb4436dde': rpc.nameBased,
                                '0xc7279f88': rpc.nameBased && rpc.supportsText,
                                '0x59d1d43c':
                                  !rpc.nameBased && rpc.supportsText,
                                '0x01ffc9a7': rpc.supportsErc165,
                                '0xffffffff': rpc.supportsInvalidInterface,
                              } as Record<Hex, boolean>
                            )[id] ?? false,
                        },
                ),
              call,
            }) as unknown as Pick<
              import('viem').PublicClient,
              'getCode' | 'readContract' | 'multicall' | 'call'
            >,
        ),
  }
})

import {
  type ProfileUploadMessage,
  type ProfileUploadRequest,
  profileUploadDomain,
  profileUploadTypes,
} from '@ens-apps/shared-schema/profile-media'

const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const workerEnv = () =>
  ({
    ...env,
    UPLOAD_IP_LIMIT: { limit: async () => ({ success: true }) },
    UPLOAD_SIGNER_LIMIT: { limit: async () => ({ success: true }) },
  }) as unknown as AvatarWorkerEnv

const signedUpload = async (
  overrides: Partial<ProfileUploadMessage> = {},
): Promise<ProfileUploadRequest> => {
  const message: ProfileUploadMessage = {
    name: 'alice.eth',
    kind: 'avatar',
    chainId: 11155111,
    service: 'https://avatar-worker-staging.ens-cf.workers.dev',
    account: signer.address,
    signer: signer.address,
    hash: sha256(jpeg),
    mimeType: 'image/jpeg',
    revision: '',
    expiry: String(Date.now() + 60000),
    ...overrides,
  }
  const sig = await signer.signTypedData({
    domain: profileUploadDomain(message.chainId),
    types: profileUploadTypes,
    primaryType: 'Upload',
    message: {
      ...message,
      account: message.account as Address,
      signer: message.signer as Address,
      hash: message.hash as Hex,
      chainId: BigInt(message.chainId),
    },
  })
  return { ...message, sig, dataURL: jpegDataUrl }
}

beforeEach(async () => {
  rpc.owner = '0x2222222222222222222222222222222222222222'
  rpc.resolver = '0x3333333333333333333333333333333333333333'
  rpc.code = '0x6000'
  rpc.nameBased = false
  rpc.fallback = false
  rpc.fallbackRejectsZero = false
  rpc.supportsText = true
  rpc.supportsInvalidInterface = false
  rpc.invalidInterfaceFails = false
  rpc.invalidInterfaceMalformed = false
  rpc.supportsErc165 = true
  rpc.failStage = ''
  rpc.expired = false
  rpc.fail = false
  rpc.allowedKey = 'avatar'
  rpc.allowedSigner = signer.address
  rpc.hcaOwner = signer.address
  for (const bucket of [env.MEDIA, env.HEADER_MEDIA]) {
    const objects = await bucket.list()
    await Promise.all(objects.objects.map(({ key }) => bucket.delete(key)))
  }
})

describe('upload signer authorization', () => {
  it.each([undefined, '0x' as Hex])(
    'rejects a non-owner when resolver bytecode is %s',
    async (code) => {
      rpc.code = code
      await expect(
        authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
      ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
    },
  )

  it('rejects a resolver fallback that accepts arbitrary writes', async () => {
    rpc.fallback = true
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
  })

  it('rejects a fallback that rejects zero but implements no text interface', async () => {
    rpc.fallback = true
    rpc.fallbackRejectsZero = true
    rpc.supportsText = false
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
  })

  it('rejects a resolver that claims to support the invalid ERC-165 interface', async () => {
    rpc.supportsInvalidInterface = true
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
  })

  it.each([false, true])(
    'requires a successful invalid-interface response (malformed boolean: %s)',
    async (malformed) => {
      rpc.invalidInterfaceFails = true
      rpc.invalidInterfaceMalformed = malformed
      await expect(
        authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
      ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
    },
  )

  it('requires ERC-165 support before trusting text capabilities', async () => {
    rpc.supportsErc165 = false
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
  })

  it.each(['code', 'interfaces', 'control', 'account'] as const)(
    'propagates an RPC failure during the %s check',
    async (stage) => {
      rpc.failStage = stage
      await expect(
        authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
      ).rejects.toThrow('RPC unavailable')
    },
  )

  it.each([false, true])(
    'allows an authorized avatar delegate with name-based setters %s',
    async (nameBased) => {
      rpc.nameBased = nameBased
      await expect(
        authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
      ).resolves.toBeUndefined()
    },
  )

  it('checks the permission for the requested header slot', async () => {
    const upload = await signedUpload({ kind: 'header' })
    await expect(
      authorizeUpload(workerEnv(), upload, 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
    rpc.allowedKey = 'header'
    await expect(
      authorizeUpload(workerEnv(), upload, 'sepolia'),
    ).resolves.toBeUndefined()
  })

  it('allows an active owner before resolver setup', async () => {
    rpc.owner = signer.address
    rpc.resolver = null
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).resolves.toBeUndefined()
  })

  it('rejects a signer whose resolver permission has been revoked', async () => {
    const upload = await signedUpload()
    rpc.allowedSigner = null
    await expect(
      authorizeUpload(workerEnv(), upload, 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' })
  })

  it('requires the current signer to control the HCA that owns the name', async () => {
    rpc.owner = '0x4444444444444444444444444444444444444444'
    const upload = await signedUpload({ account: rpc.owner })
    await expect(
      authorizeUpload(workerEnv(), upload, 'sepolia'),
    ).resolves.toBeUndefined()
    rpc.hcaOwner = '0x5555555555555555555555555555555555555555'
    await expect(
      authorizeUpload(workerEnv(), upload, 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'INVALID_ACCOUNT' })
  })

  it('rejects an expired name even for its owner', async () => {
    rpc.owner = signer.address
    rpc.expired = true
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toMatchObject({ status: 403, code: 'ACTIVE_ENSV2_REQUIRED' })
  })

  it('does not convert RPC failures into authorization', async () => {
    rpc.fail = true
    await expect(
      authorizeUpload(workerEnv(), await signedUpload(), 'sepolia'),
    ).rejects.toThrow('RPC unavailable')
  })
})

describe('upload endpoint binding', () => {
  const put = (upload: ProfileUploadRequest, path = '/sepolia/alice.eth') =>
    app.fetch(
      new Request(`https://avatar-worker-staging.ens-cf.workers.dev${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      }),
      workerEnv(),
    )

  it('rejects a signed name that differs from the path without writing an image', async () => {
    const response = await put(await signedUpload({ name: 'bob.eth' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'UPLOAD_TARGET_MISMATCH' },
    })
    expect((await env.MEDIA.list()).objects).toHaveLength(0)
  })

  it('rejects a changed signed name even when the body and path agree', async () => {
    const upload = await signedUpload()
    const response = await put(
      { ...upload, name: 'bob.eth' },
      '/sepolia/bob.eth',
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_SIGNATURE' },
    })
    expect((await env.MEDIA.list()).objects).toHaveLength(0)
  })

  it('publishes a correctly signed authorized upload', async () => {
    rpc.owner = signer.address
    const response = await put(await signedUpload())
    expect(response.status).toBe(200)
    const metadata = await env.MEDIA.head('sepolia/registered/alice.eth')
    expect(metadata?.customMetadata?.profileMediaVersion).toBe('2')
  })
})
