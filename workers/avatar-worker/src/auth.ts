import { buildConfig } from '@ens-apps/config'
import {
  getProfileImagePath,
  type ProfileUploadRequest,
  profileUploadDomain,
  profileUploadTypes,
} from '@ens-apps/shared-schema/profile-media'
import { AccountVerificationError } from '@ens-apps/smart-account/errors'
import { verifyStandaloneHca } from '@ens-apps/smart-account/providers/rhinestone/verify-account'
import { getResolver } from '@ensdomains/ensjs/public'
import { getExpiry, getOwner } from '@ensdomains/ensjs/public/v2'
import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import {
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroDataError,
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  ExecutionRevertedError,
  encodeFunctionData,
  type Hex,
  http,
  InvalidBytesBooleanError,
  isAddressEqual,
  namehash,
  type PublicClient,
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
const supportsInterfaceAbi = parseAbi([
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
])

const getTextSetterKind = async (client: PublicClient, resolver: Address) => {
  const interfaces = [
    toFunctionSelector('setText(bytes,string,string)'),
    toFunctionSelector('text(bytes32,string)'),
    '0x01ffc9a7',
    '0xffffffff',
  ] as const
  const probes = await client.multicall({
    contracts: interfaces.map((interfaceId) => ({
      address: resolver,
      abi: supportsInterfaceAbi,
      functionName: 'supportsInterface',
      args: [interfaceId],
    })),
  })
  const failed = probes.find((probe) => probe.status === 'failure')
  if (failed?.status === 'failure') {
    const error = failed.error
    if (
      !(
        error instanceof BaseError &&
        error.walk(
          (cause) =>
            cause instanceof ExecutionRevertedError ||
            cause instanceof ContractFunctionRevertedError ||
            cause instanceof ContractFunctionZeroDataError ||
            cause instanceof AbiDecodingDataSizeTooSmallError ||
            cause instanceof AbiDecodingZeroDataError ||
            cause instanceof InvalidBytesBooleanError,
        )
      )
    )
      throw error
    throw new MediaError(
      403,
      'NOT_AUTHORIZED',
      'The resolver does not implement ERC-165 text capabilities',
      error,
    )
  }
  const [nameBased, nodeBased, supportsErc165, supportsInvalidInterface] =
    probes.map((probe) => probe.status === 'success' && probe.result)
  if (!supportsErc165 || supportsInvalidInterface || (!nameBased && !nodeBased))
    throw new MediaError(
      403,
      'NOT_AUTHORIZED',
      'This resolver does not support authorized text edits',
    )
  return nameBased ? 'name' : 'node'
}

const canWriteResolverText = async (
  client: PublicClient,
  resolver: Address,
  account: Address,
  data: Hex,
) => {
  try {
    await client.call({ account, to: resolver, data })
    return true
  } catch (error) {
    if (
      error instanceof BaseError &&
      error.walk((cause) => cause instanceof ExecutionRevertedError)
    )
      return false
    throw error
  }
}

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
      if (
        error instanceof AccountVerificationError ||
        (error instanceof BaseError &&
          error.walk(
            (cause) =>
              cause instanceof ContractFunctionZeroDataError ||
              cause instanceof ExecutionRevertedError,
          ))
      )
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
  const code = resolver
    ? await client.getCode({ address: resolver })
    : undefined
  if (!resolver || !code || code === '0x')
    throw new MediaError(
      403,
      'NOT_AUTHORIZED',
      'This account cannot edit this image',
    )
  const setterKind = await getTextSetterKind(client, resolver)
  const imageUrl = `${upload.service}${getProfileImagePath(network, upload.name, upload.kind)}`
  const data =
    setterKind === 'name'
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
  // A no-op fallback can accept a setter without applying any permission
  // checks. Require the identical call to reject the zero address, which can
  // never be the active owner or a signing delegate, before trusting success.
  if (
    (await canWriteResolverText(client, resolver, zeroAddress, data)) ||
    !(await canWriteResolverText(client, resolver, account, data))
  )
    throw new MediaError(
      403,
      'NOT_AUTHORIZED',
      'This account cannot edit this image',
    )
}
