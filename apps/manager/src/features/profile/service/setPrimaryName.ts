import {
  ENS_SEPOLIA_CONTRACTS,
  getSmartAccountAddress,
  type RhinestoneSigner,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { DEFAULT_REVERSE_REGISTRAR_ABI } from '@ens-apps/transaction-manager/contracts/abis/DefaultReverseRegistrar.abi'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs/contracts'
import {
  type Address,
  encodeFunctionData,
  encodePacked,
  type Hex,
  keccak256,
  type PublicClient,
  toFunctionSelector,
  type WalletClient,
} from 'viem'

const ETH_COIN_TYPE = 60n
const SIGNATURE_TTL_SECONDS = 30 * 60

export interface SetPrimaryNameParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  signer: Signer
  /** `from` for EOA transactions (the owner / EOA address) */
  accountAddress: Address
  /** EOA owner address; required for the smart-account signature flow */
  eoaAddress?: Address
  /** Wallet client used to sign the authorization (smart-account flow) */
  walletClient?: WalletClient
  publicClient: PublicClient
  chainId: number
  /** Called with each submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
  /** Supplies the signature expiry (seconds). Defaults to now + 30m. */
  now?: () => number
}

const withEthSuffix = (name: string) =>
  name.endsWith('.eth') ? name : `${name}.eth`

type SignatureFlowFields = Pick<
  SetPrimaryNameParams,
  'signer' | 'walletClient' | 'eoaAddress'
>

/**
 * Whether the smart-account signature flow applies: a non-EOA signer with an
 * EOA owner + wallet client available to authorize the reverse record. Typed
 * as a guard so callers get `walletClient`/`eoaAddress` narrowed to non-null.
 */
export const needsSignatureFlow = <T extends SignatureFlowFields>(
  params: T,
): params is T & {
  signer: RhinestoneSigner
  walletClient: WalletClient
  eoaAddress: Address
} =>
  params.signer.type !== 'eoa' && !!params.walletClient && !!params.eoaAddress

/**
 * Request the EOA's authorization signature for setNameForAddrWithSignature.
 * Off-chain (no gas); the smart account submits it.
 */
async function requestPrimaryNameSignature(input: {
  name: string
  eoaAddress: Address
  signatureExpiry: bigint
  coinTypes: bigint[]
  walletClient: WalletClient
  registrarAddress: Address
}): Promise<Hex> {
  const cleanName = withEthSuffix(input.name)

  const selector = toFunctionSelector(
    'setNameForAddrWithSignature(address,uint256,string,uint256[],bytes)',
  )

  const packedData = encodePacked(
    ['address', 'bytes4', 'address', 'uint256', 'string', 'uint256[]'],
    [
      input.registrarAddress,
      selector,
      input.eoaAddress,
      input.signatureExpiry,
      cleanName,
      input.coinTypes,
    ],
  )
  const messageHash = keccak256(packedData)

  if (!input.walletClient.account) {
    throw new Error('walletClient.account is required to sign message')
  }

  // signMessage with raw bytes applies the EIP-191 prefix automatically.
  return input.walletClient.signMessage({
    account: input.walletClient.account,
    message: { raw: messageHash },
  })
}

/**
 * Submit the smart-account signature flow: a single sponsored, batched
 * transaction that sets the EOA's reverse record via signature.
 */
function submitWithSignature(input: {
  name: string
  eoaAddress: Address
  signature: Hex
  signatureExpiry: bigint
  coinTypes: bigint[]
  signer: RhinestoneSigner
  publicClient: PublicClient
  chainId: number
}): string {
  const cleanName = withEthSuffix(input.name)
  const defaultRegistrar = ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar
  const reverseRegistrar = ENS_SEPOLIA_CONTRACTS.ReverseRegistrar

  const defaultData = encodeFunctionData({
    abi: DEFAULT_REVERSE_REGISTRAR_ABI,
    functionName: 'setNameForAddrWithSignature',
    args: [
      input.eoaAddress,
      input.signatureExpiry,
      cleanName,
      input.coinTypes,
      input.signature,
    ],
  })
  const reverseData = encodeFunctionData({
    abi: reverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [cleanName],
  })

  const request: TransactionRequest = {
    type: 'rhinestone-intent',
    from: getSmartAccountAddress(input.signer),
    to: defaultRegistrar,
    data: defaultData,
    value: 0n,
    chainId: input.chainId,
    rhinestoneParams: {
      calls: [
        { to: defaultRegistrar, data: defaultData, value: 0n },
        { to: reverseRegistrar, data: reverseData, value: 0n },
      ],
      sponsored: true,
      useSession: false,
    },
  }

  return transactionManager.startTransaction(
    { type: 'custom', request },
    input.signer,
    {
      description: `Set primary name to ${cleanName} for ${input.eoaAddress}`,
      publicClient: input.publicClient,
      chainId: input.chainId,
      operation: 'set-primary-name',
      name: cleanName,
    },
  )
}

/** EOA forward leg: setName on the default reverse registrar. */
function submitForward(input: {
  name: string
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): string {
  const cleanName = withEthSuffix(input.name)
  const data = encodeFunctionData({
    abi: DEFAULT_REVERSE_REGISTRAR_ABI,
    functionName: 'setName',
    args: [cleanName],
  })

  const request: TransactionRequest = {
    type: 'eoa',
    from: input.accountAddress,
    to: ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar,
    data,
    value: 0n,
    chainId: input.chainId,
  }

  return transactionManager.startTransaction(
    { type: 'custom', request },
    input.signer,
    {
      description: `Set primary name to ${cleanName}`,
      publicClient: input.publicClient,
      chainId: input.chainId,
      operation: 'set-primary-name',
      name: cleanName,
    },
  )
}

/** EOA reverse leg: setName on the reverse registrar. */
function submitReverse(input: {
  name: string
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): string {
  const cleanName = withEthSuffix(input.name)
  const data = encodeFunctionData({
    abi: reverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [cleanName],
  })

  const request: TransactionRequest = {
    type: 'eoa',
    from: input.accountAddress,
    to: ENS_SEPOLIA_CONTRACTS.ReverseRegistrar,
    data,
    value: 0n,
    chainId: input.chainId,
  }

  return transactionManager.startTransaction(
    { type: 'custom', request },
    input.signer,
    {
      description: `Set addr.reverse for ${cleanName}`,
      publicClient: input.publicClient,
      chainId: input.chainId,
      operation: 'set-primary-name',
      name: cleanName,
    },
  )
}

/**
 * Set an ENS name as the account's primary name through the transaction
 * manager. Replaces primaryNameMachine with sequenced direct calls:
 *
 * - Smart account: one off-chain EOA signature, then one sponsored batched tx.
 * - EOA: forward (default reverse registrar) then reverse (reverse registrar),
 *   two sequential transactions.
 *
 * Resolves once the final transaction is confirmed.
 */
export async function setPrimaryName(
  params: SetPrimaryNameParams,
): Promise<void> {
  const { name, signer, accountAddress, publicClient, chainId, onTxId } = params

  if (needsSignatureFlow(params)) {
    const { eoaAddress, walletClient } = params
    const nowSeconds = params.now ? params.now() : Math.floor(Date.now() / 1000)
    const signatureExpiry = BigInt(nowSeconds + SIGNATURE_TTL_SECONDS)
    const coinTypes = [ETH_COIN_TYPE]

    const signature = await requestPrimaryNameSignature({
      name,
      eoaAddress,
      signatureExpiry,
      coinTypes,
      walletClient,
      registrarAddress: ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar,
    })

    const txId = submitWithSignature({
      name,
      eoaAddress,
      signature,
      signatureExpiry,
      coinTypes,
      signer: params.signer,
      publicClient,
      chainId,
    })
    onTxId?.(txId)
    await waitForTransaction(txId)
    return
  }

  // EOA: two sequential transactions (forward, then reverse).
  const forwardTxId = submitForward({
    name,
    signer,
    accountAddress,
    publicClient,
    chainId,
  })
  onTxId?.(forwardTxId)
  await waitForTransaction(forwardTxId)

  const reverseTxId = submitReverse({
    name,
    signer,
    accountAddress,
    publicClient,
    chainId,
  })
  onTxId?.(reverseTxId)
  await waitForTransaction(reverseTxId)
}
