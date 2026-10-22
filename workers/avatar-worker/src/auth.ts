import { buildConfig } from '@ens-apps/config'
import {
  getProfileImagePath,
  type ProfileUploadRequest,
  profileUploadDomain,
  profileUploadTypes,
} from '@ens-apps/shared-schema/profile-media'
import { AccountVerificationError } from '@ens-apps/smart-account/errors'
import { verifyStandaloneHca } from '@ens-apps/smart-account/providers/rhinestone/verify-account'
import { getResolver, getSupportedInterfaces } from '@ensdomains/ensjs/public'
import { getExpiry, getOwner } from '@ensdomains/ensjs/public/v2'
import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import {
  type Address,
  BaseError,
  createPublicClient,
  ExecutionRevertedError,
  encodeFunctionData,
  http,
  isAddressEqual,
  namehash,
  parseAbi,
  toFunctionSelector,
  zeroAddress,
} from 'viem'
import { verifyTypedData } from 'viem/actions'
import { MediaError } from './error'

const textSetters = parseAbi([
  'function setText(bytes name, string key, string value)',
  'function setText(bytes32 node, string key, string value)',
])

export const authorizeUpload = async (
  env: AvatarWorkerEnv,
  upload: ProfileUploadRequest,
  network: 'mainnet' | 'sepolia',
) => {
  const rpcUrl = (
    network === 'mainnet' ? env.MAINNET_RPC_URL : env.SEPOLIA_RPC_URL
  )?.trim()
  if (!rpcUrl || !['https:', 'http:'].includes(new URL(rpcUrl).protocol))
    throw new MediaError(
      503,
      'RPC_UNAVAILABLE',
      'Network RPC is not configured',
    )
  const { chain } = buildConfig({ network, rpcUrl, endpoints: [] })
  const client = createPublicClient({
    chain,
    ccipRead: false,
    transport: http(rpcUrl, {
      timeout: 5000,
      retryCount: 0,
      fetchOptions: { signal: AbortSignal.timeout(15000) },
    }),
  })
  const { dataURL: _dataURL, sig, ...message } = upload
  const valid = await verifyTypedData(client, {
    address: upload.signer as Address,
    signature: sig as `0x${string}`,
    domain: profileUploadDomain(upload.chainId),
    types: profileUploadTypes,
    primaryType: 'Upload',
    message: {
      ...message,
      account: upload.account as Address,
      signer: upload.signer as Address,
      hash: upload.hash as `0x${string}`,
      chainId: BigInt(upload.chainId),
    },
  })
  if (!valid)
    throw new MediaError(
      403,
      'INVALID_SIGNATURE',
      'Invalid image upload signature',
    )
  if (
    !(await env.UPLOAD_SIGNER_LIMIT.limit({ key: upload.signer.toLowerCase() }))
      .success
  )
    throw new MediaError(
      429,
      'RATE_LIMITED',
      'Too many image uploads. Try again shortly.',
    )

  const account = upload.account as Address
  if (!isAddressEqual(account, upload.signer as Address)) {
    try {
      await verifyStandaloneHca({
        publicClient: client,
        hca: account,
        expectedOwner: upload.signer as Address,
        chainId: upload.chainId,
      })
    } catch (error) {
      if (error instanceof AccountVerificationError)
        throw new MediaError(
          403,
          'INVALID_ACCOUNT',
          'The signer does not control this supported smart account',
        )
      throw error
    }
  }
  const [owner, expiry] = await Promise.all([
    getOwner(client, { name: upload.name }),
    getExpiry(client, { name: `${upload.name.split('.').at(-2)}.eth` }),
  ])
  if (
    !owner ||
    isAddressEqual(owner, zeroAddress) ||
    expiry <= BigInt(Math.floor(Date.now() / 1000))
  )
    throw new MediaError(
      403,
      'ACTIVE_ENSV2_REQUIRED',
      'Uploads require an active ENSv2 name',
    )
  if (isAddressEqual(owner, account)) return

  const resolver = await getResolver(client, { name: upload.name })
  if (!resolver)
    throw new MediaError(
      403,
      'NOT_AUTHORIZED',
      'This account cannot edit this image',
    )
  const [nameBased] = await getSupportedInterfaces(client, {
    address: resolver,
    interfaces: [toFunctionSelector('setAddress(bytes,uint256,bytes)')],
  })
  const imageUrl = `${upload.service}${getProfileImagePath(network, upload.name, upload.kind)}`
  const data = nameBased
    ? encodeFunctionData({
        abi: [textSetters[0]],
        functionName: 'setText',
        args: [dnsEncodeName(upload.name), upload.kind, imageUrl],
      })
    : encodeFunctionData({
        abi: [textSetters[1]],
        functionName: 'setText',
        args: [namehash(upload.name), upload.kind, imageUrl],
      })
  try {
    await client.call({ account, to: resolver, data })
  } catch (error) {
    if (
      error instanceof BaseError &&
      error.walk((cause) => cause instanceof ExecutionRevertedError)
    )
      throw new MediaError(
        403,
        'NOT_AUTHORIZED',
        'This account cannot edit this image',
      )
    throw error
  }
}
