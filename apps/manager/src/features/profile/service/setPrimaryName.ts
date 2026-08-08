import {
  type Call,
  ENS_SEPOLIA_CONTRACTS,
  getSmartAccountAddress,
  type RhinestoneSigner,
  type RhinestoneTransactionRequest,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  defaultReverseRegistrarSetNameSnippet,
  reverseRegistrarSetNameSnippet,
} from '@ensdomains/ensjs/contracts'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  namehash,
  type PublicClient,
  parseAbi,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { normalize } from 'viem/ens'

export interface SetPrimaryNameParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  /**
   * The EOA that claims the primary name. The reverse registrars key
   * `setName` on `msg.sender`, so this EOA sends both transactions itself.
   */
  ownerAddress: Address
  /** Wallet client for the owner EOA; signs and sends both transactions. */
  walletClient: WalletClient
  publicClient: PublicClient
  chainId: number
  /** Called with each submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
}

// Normalized claim string: a non-canonical name would fail the bidirectional
// check at resolution time and read as "no primary name".
const withEthSuffix = (name: string) =>
  normalize(name.endsWith('.eth') ? name : `${name}.eth`)

const reverseAdapterAbi = parseAbi([
  'function setNameWithHCA(address addr, string name)',
  'function claimWithHCA(address addr, address resolver) returns (bytes32)',
])

const registryResolverAbi = parseAbi([
  'function resolver(bytes32 node) view returns (address)',
])

/** v1 reverse node for an address: namehash of `<hex-addr>.addr.reverse`. */
export const addrReverseNode = (address: Address): Hex =>
  namehash(`${address.slice(2).toLowerCase()}.addr.reverse`)

export interface SetPrimaryNameWithHcaParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  /** The rhinestone signer from the smart-account context. */
  signer: RhinestoneSigner
  /** The owner EOA the primary name is claimed for. */
  ownerAddress: Address
  publicClient: PublicClient
  chainId: number
  /** Called with the submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
}

/**
 * Set a primary name through the HCA in one user-paid (USDC), owner-signed
 * intent: `DefaultReverseRegistrarAdapter.setNameWithHCA` writes
 * `default.reverse`, and when the owner has a live `addr.reverse` entry
 * (which would shadow the default), `ReverseRegistrarAdapter.claimWithHCA`
 * with a zero resolver clears it so resolution falls back to the fresh
 * default claim.
 */
export async function setPrimaryNameWithHca(
  params: SetPrimaryNameWithHcaParams,
): Promise<void> {
  const { name, signer, ownerAddress, publicClient, chainId, onTxId } = params
  const cleanName = withEthSuffix(name)

  const calls: Call[] = [
    {
      to: ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrarAdapter,
      value: 0n,
      data: encodeFunctionData({
        abi: reverseAdapterAbi,
        functionName: 'setNameWithHCA',
        args: [ownerAddress, cleanName],
      }),
    },
  ]

  const staleResolver = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.LegacyRegistry,
    abi: registryResolverAbi,
    functionName: 'resolver',
    args: [addrReverseNode(ownerAddress)],
  })

  if (staleResolver !== zeroAddress) {
    calls.push({
      to: ENS_SEPOLIA_CONTRACTS.ReverseRegistrarAdapter,
      value: 0n,
      data: encodeFunctionData({
        abi: reverseAdapterAbi,
        functionName: 'claimWithHCA',
        args: [ownerAddress, zeroAddress],
      }),
    })
  }

  const request: RhinestoneTransactionRequest = {
    type: 'rhinestone-intent',
    from: getSmartAccountAddress(signer),
    chainId,
    rhinestoneParams: {
      calls,
    },
  }

  // Owner-signed on purpose: changing the primary identity warrants an
  // explicit wallet approval, and it keeps the claim leg independent of the
  // session's action allowlist.
  const ownerSigner: RhinestoneSigner = { ...signer, session: undefined }

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    ownerSigner,
    {
      description: `Set primary name to ${cleanName}`,
      publicClient,
      chainId,
      operation: 'set-primary-name',
      name: cleanName,
    },
  )
  onTxId?.(txId)
  await waitForTransaction(txId)
}

/** EOA forward leg: setName on the default reverse registrar. */
export function submitPrimaryNameForward(input: {
  name: string
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): string {
  const cleanName = withEthSuffix(input.name)
  const data = encodeFunctionData({
    abi: defaultReverseRegistrarSetNameSnippet,
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
export function submitPrimaryNameReverse(input: {
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
 * EOA fallback (USE_EOA / no smart account): the owner sends two sequential
 * gas-paying transactions. HCA accounts use `setPrimaryNameWithHca` instead.
 */
export async function setPrimaryName(
  params: SetPrimaryNameParams,
): Promise<void> {
  const { name, ownerAddress, walletClient, publicClient, chainId, onTxId } =
    params

  // The wallet client and the owner address come from the account context
  // separately and can momentarily diverge while the wallet reconnects or the
  // user switches accounts. Require a bound account that matches the owner:
  // an account-less client gives no way to verify the wallet controls the
  // owner address, and a mismatched one would fail at the wallet.
  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, ownerAddress)
  ) {
    throw new Error(
      'Cannot set primary name - the connected wallet does not control the owner address.',
    )
  }

  const signer: Signer = { type: 'eoa', walletClient }

  const forwardTxId = submitPrimaryNameForward({
    name,
    signer,
    accountAddress: ownerAddress,
    publicClient,
    chainId,
  })
  onTxId?.(forwardTxId)
  await waitForTransaction(forwardTxId)

  const reverseTxId = submitPrimaryNameReverse({
    name,
    signer,
    accountAddress: ownerAddress,
    publicClient,
    chainId,
  })
  onTxId?.(reverseTxId)
  await waitForTransaction(reverseTxId)
}
