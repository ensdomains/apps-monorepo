import {
  ENS_SEPOLIA_CONTRACTS,
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
  isAddressEqual,
  type PublicClient,
  type WalletClient,
} from 'viem'

export interface SetPrimaryNameParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  /**
   * The EOA that claims the primary name. The deployed reverse registrars key
   * `setName` on `msg.sender` and are not HCA-aware (no HCA adapter is
   * deployed yet), so both transactions MUST be sent from this address —
   * never from a smart account (an HCA-sent `setName` writes the HCA's
   * reverse node, not the user's).
   */
  ownerAddress: Address
  /** Wallet client for the owner EOA; signs and sends both transactions. */
  walletClient: WalletClient
  publicClient: PublicClient
  chainId: number
  /** Called with each submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
}

const withEthSuffix = (name: string) =>
  name.endsWith('.eth') ? name : `${name}.eth`

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
 * Set an ENS name as the account's primary name through the transaction
 * manager.
 *
 * A primary name is an EOA interaction: the deployed reverse registrars key
 * `setName` on `msg.sender` and are not HCA-aware (the reverse namespace runs
 * on v1 infrastructure at launch; no HCA adapter is deployed). The owner EOA
 * therefore sends two sequential transactions (forward on the default reverse
 * registrar, then reverse on the reverse registrar) and pays gas — even when
 * the session otherwise runs through a smart account. Routing these through
 * the HCA writes the smart account's reverse node and never produces a
 * resolvable coin-60 primary.
 *
 * Resolves once the final transaction is confirmed.
 */
export async function setPrimaryName(
  params: SetPrimaryNameParams,
): Promise<void> {
  const { name, ownerAddress, walletClient, publicClient, chainId, onTxId } =
    params

  // The wallet client and the owner address come from the account context
  // separately and can momentarily diverge while the wallet reconnects or the
  // user switches accounts. Sending from an address the wallet does not
  // control would fail at the transport, so reject up front.
  if (
    walletClient.account &&
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
