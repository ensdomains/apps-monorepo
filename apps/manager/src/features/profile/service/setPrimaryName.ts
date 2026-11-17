import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type Call,
  getSmartAccountAddress,
  HCA_INTENT_FEE_MARGIN_BPS,
  type HcaFundingPrompt,
  planHcaIntentFunding,
  quoteHcaIntentFeeUsdc,
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
  defaultReverseRegistrarAdapterSetNameSnippet,
  defaultReverseRegistrarAdapterSetNameWithHcaSnippet,
} from '@ensdomains/ensjs-abi/v2/defaultReverseRegistrarAdapter'
import {
  reverseRegistrarAdapterClaimSnippet,
  reverseRegistrarAdapterClaimWithHcaSnippet,
} from '@ensdomains/ensjs-abi/v2/reverseRegistrarAdapter'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  namehash,
  type PublicClient,
  parseAbi,
  type WalletClient,
  zeroAddress,
} from 'viem'
import type { Connector } from 'wagmi'
import { envConfig } from '@/config'
import { assertPrimaryNameForwardResolution } from './primaryNameForwardAddress'
import {
  type PrimaryNamePaymentInputs,
  selectPrimaryNamePayment,
} from './primaryNamePayment'
import { requireCanonicalPrimaryName } from './profileName'

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
  /** The wallet's wagmi connector. A Safe{Wallet} one answers with safeTxHashes. */
  readonly connector?: Connector
  /** Called with each submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
}

const defaultReverseAdapterAbi = [
  ...defaultReverseRegistrarAdapterSetNameSnippet,
  ...defaultReverseRegistrarAdapterSetNameWithHcaSnippet,
] as const

const reverseAdapterAbi = [
  ...reverseRegistrarAdapterClaimSnippet,
  ...reverseRegistrarAdapterClaimWithHcaSnippet,
] as const

const registryResolverAbi = parseAbi([
  'function resolver(bytes32 node) view returns (address)',
])

/** v1 reverse node for an address: namehash of `<hex-addr>.addr.reverse`. */
export const addrReverseNode = (address: Address): Hex =>
  namehash(`${address.slice(2).toLowerCase()}.addr.reverse`)

/**
 * Whether the owner has a live `addr.reverse` entry that would shadow a
 * `default.reverse` claim.
 *
 * `addr.reverse` is chain-specific and takes precedence over the
 * chain-agnostic `default.reverse` (ENSIP-19), so a leftover entry makes a
 * fresh default claim invisible. Worse, it does not merely lose — if the old
 * name no longer resolves forward, the UniversalResolver *reverts*
 * (`ResolverNotFound`) instead of falling through, and the address reads as
 * having no primary name at all.
 *
 * Presence of a resolver on the node is the test, because that is exactly what
 * the resolver-lookup step of reverse resolution keys on: clearing it is what
 * lets resolution fall through to `default.reverse`.
 */
export async function hasStaleAddrReverse(input: {
  publicClient: PublicClient
  ownerAddress: Address
}): Promise<boolean> {
  const resolver = await input.publicClient.readContract({
    address: envConfig.chain.contracts.ensLegacyRegistry.address,
    abi: registryResolverAbi,
    functionName: 'resolver',
    args: [addrReverseNode(input.ownerAddress)],
  })

  return resolver !== zeroAddress
}

export interface SetPrimaryNameWithHcaParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  /** The rhinestone signer from the smart-account context. */
  signer: RhinestoneSigner
  /** The owner EOA the primary name is claimed for. */
  ownerAddress: Address
  /**
   * Owner wallet client. Signs the intent, and the EIP-2612 funding permit
   * when the HCA cannot cover its own fee.
   */
  walletClient: WalletClient
  publicClient: PublicClient
  chainId: number
  /** Called with the submitted txId so the UI can track it via a selector */
  onTxId?: (txId: string) => void
  /**
   * Show the USDC amount the funding permit will authorize and wait for the
   * user to accept it. Called only when the HCA cannot cover its own fee, and
   * always before the wallet is asked to sign. Declining aborts the whole
   * action with `HcaFundingDeclinedError`.
   */
  confirmFunding?: (prompt: HcaFundingPrompt) => Promise<boolean> | boolean
}

/** The adapters' entry points: the HCA's, or the owner's own (keyed on `msg.sender`). */
const ADAPTER_FUNCTIONS = {
  hca: { setName: 'setNameWithHCA', claim: 'claimWithHCA' },
  owner: { setName: 'setName', claim: 'claim' },
} as const

/** Write `default.reverse`, and clear a stale `addr.reverse` when asked. */
const primaryNameAdapterCalls = (
  caller: keyof typeof ADAPTER_FUNCTIONS,
  ownerAddress: Address,
  cleanName: string,
  clearsStaleAddrReverse: boolean,
): readonly Call[] => [
  {
    to: envConfig.chain.contracts.ensDefaultReverseRegistrarAdapter.address,
    value: 0n,
    data: encodeFunctionData({
      abi: defaultReverseAdapterAbi,
      functionName: ADAPTER_FUNCTIONS[caller].setName,
      args: [ownerAddress, cleanName],
    }),
  },
  ...(clearsStaleAddrReverse
    ? [
        {
          to: envConfig.chain.contracts.ensReverseRegistrarAdapter.address,
          value: 0n,
          data: encodeFunctionData({
            abi: reverseAdapterAbi,
            functionName: ADAPTER_FUNCTIONS[caller].claim,
            args: [ownerAddress, zeroAddress],
          }),
        },
      ]
    : []),
]

/**
 * Set a primary name through the HCA in one owner-signed intent:
 * `DefaultReverseRegistrarAdapter.setNameWithHCA` writes `default.reverse`,
 * and when the owner has a live `addr.reverse` entry (which would shadow the
 * default), `ReverseRegistrarAdapter.claimWithHCA(owner, 0)` clears it so
 * resolution falls back to the fresh default claim.
 *
 * User-paid in USDC like every other intent on this route — NOT sponsored. The
 * HCA is left near-empty by registration (the budget carries no buffer), so
 * `planHcaIntentFunding` quotes the fee and pulls the shortfall in from the
 * owner's wallet inside this same intent.
 */
export async function setPrimaryNameWithHca(
  params: SetPrimaryNameWithHcaParams,
): Promise<void> {
  const {
    name,
    signer,
    ownerAddress,
    walletClient,
    publicClient,
    chainId,
    onTxId,
    confirmFunding,
  } = params
  const cleanName = requireCanonicalPrimaryName(name)

  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, ownerAddress)
  ) {
    throw new Error(
      'Cannot set primary name - the connected wallet does not control the owner address.',
    )
  }

  await assertPrimaryNameForwardResolution(
    publicClient,
    cleanName,
    ownerAddress,
  )

  const clearsStaleAddrReverse = await hasStaleAddrReverse({
    publicClient,
    ownerAddress,
  })

  const calls = primaryNameAdapterCalls(
    'hca',
    ownerAddress,
    cleanName,
    clearsStaleAddrReverse,
  )

  // Owner-signed on purpose: changing the primary identity warrants an
  // explicit wallet approval. The owner-signed path takes the 65-byte ECDSA
  // branch in `isValidSignatureWithSender`, which applies no action policy —
  // which is also what makes the funding permit legal here, unlike inside the
  // session-signed commit leg.
  const ownerSigner: RhinestoneSigner = { ...signer, session: undefined }

  const funding = await planHcaIntentFunding({
    signer: ownerSigner,
    ownerAddress,
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    chainId,
    calls,
    feeMarginBps: HCA_INTENT_FEE_MARGIN_BPS,
    // The USDC cost is quoted here, not at any earlier screen, so this is the
    // only place it can be shown before the permit signature is requested.
    ...(confirmFunding ? { confirmFunding } : {}),
  })

  const request: RhinestoneTransactionRequest = {
    type: 'rhinestone-intent',
    from: getSmartAccountAddress(signer),
    chainId,
    rhinestoneParams: {
      calls: funding.calls,
      // User-paid in USDC, like every intent on this route.
      feeAsset: 'USDC',
      paymentToken: funding.paymentToken,
      ...(funding.auxiliaryFunds
        ? { auxiliaryFunds: funding.auxiliaryFunds }
        : {}),
    },
  }

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
export async function submitPrimaryNameForward(input: {
  name: string
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): Promise<string> {
  const cleanName = requireCanonicalPrimaryName(input.name)
  await assertPrimaryNameForwardResolution(
    input.publicClient,
    cleanName,
    input.accountAddress,
  )
  const data = encodeFunctionData({
    abi: defaultReverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [cleanName],
  })

  const request: TransactionRequest = {
    type: 'eoa',
    from: input.accountAddress,
    to: envConfig.chain.contracts.ensDefaultReverseRegistrar.address,
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
export async function submitPrimaryNameReverse(input: {
  name: string
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): Promise<string> {
  const cleanName = requireCanonicalPrimaryName(input.name)
  await assertPrimaryNameForwardResolution(
    input.publicClient,
    cleanName,
    input.accountAddress,
  )
  const data = encodeFunctionData({
    abi: reverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [cleanName],
  })

  const request: TransactionRequest = {
    type: 'eoa',
    from: input.accountAddress,
    to: envConfig.chain.contracts.ensReverseRegistrar.address,
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
 * EOA fallback (USE_EOA / no smart account / a Safe{Wallet}): the owner sends two
 * sequential gas-paying transactions. HCA accounts use `setPrimaryNameWithHca` instead.
 */
export async function setPrimaryName({
  name,
  ownerAddress,
  walletClient,
  publicClient,
  chainId,
  connector,
  onTxId,
}: SetPrimaryNameParams): Promise<void> {
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

  const signer: Signer = { type: 'eoa', walletClient, connector }

  const forwardTxId = await submitPrimaryNameForward({
    name,
    signer,
    accountAddress: ownerAddress,
    publicClient,
    chainId,
  })
  onTxId?.(forwardTxId)
  await waitForTransaction(forwardTxId)

  const reverseTxId = await submitPrimaryNameReverse({
    name,
    signer,
    accountAddress: ownerAddress,
    publicClient,
    chainId,
  })
  onTxId?.(reverseTxId)
  await waitForTransaction(reverseTxId)
}

/** Wei the owner's adapter calls are estimated to cost at the current max fee, stale `addr.reverse` included. */
const estimateOwnerPrimaryNameCost = async (
  publicClient: PublicClient,
  ownerAddress: Address,
  cleanName: string,
): Promise<bigint> => {
  const calls = primaryNameAdapterCalls('owner', ownerAddress, cleanName, true)
  const [gas, { maxFeePerGas }] = await Promise.all([
    Promise.all(
      calls.map(({ to, data }) =>
        publicClient.estimateGas({ account: ownerAddress, to, data }),
      ),
    ),
    publicClient.estimateFeesPerGas(),
  ])
  return gas.reduce((sum, units) => sum + units, 0n) * maxFeePerGas
}

/** Balances, the USDC fee and the ETH cost {@link selectPrimaryNamePayment} decides on. */
const readPrimaryNamePaymentInputs = async ({
  name,
  signer,
  ownerAddress,
  publicClient,
  chainId,
}: SetPrimaryNameWithHcaParams): Promise<PrimaryNamePaymentInputs> => {
  const cleanName = requireCanonicalPrimaryName(name)
  const usdc = getDestinationContracts(chainId).usdc
  const readUsdc = (holder: Address) =>
    publicClient.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [holder],
    })

  // Only the HCA read is required: the USDC route reads it too. An unread wallet balance counts nothing.
  const [hcaUsdc, walletUsdc, walletEth, ethCost] = await Promise.all([
    readUsdc(getSmartAccountAddress(signer)),
    readUsdc(ownerAddress).catch(() => null),
    publicClient.getBalance({ address: ownerAddress }).catch(() => null),
    estimateOwnerPrimaryNameCost(publicClient, ownerAddress, cleanName).catch(
      () => null,
    ),
  ])

  // Quoted on the larger batch, so the fee is never under-read; skipped when no USDC can pay it.
  const feeUsdc =
    hcaUsdc + (walletUsdc ?? 0n) === 0n
      ? null
      : await quoteHcaIntentFeeUsdc({
          signer: { ...signer, session: undefined },
          ownerAddress,
          publicClient,
          chainId,
          calls: primaryNameAdapterCalls('hca', ownerAddress, cleanName, true),
          feeMarginBps: HCA_INTENT_FEE_MARGIN_BPS,
        }).catch(() => null)

  return { hcaUsdc, walletUsdc, feeUsdc, walletEth, ethCost }
}

export interface SetPrimaryNameWithEthFallbackParams
  extends SetPrimaryNameWithHcaParams {
  /** The wallet's wagmi connector, for the direct transactions. */
  readonly connector?: Connector
}

/** The ETH route: the owner sends the HCA batch's adapter calls itself, one transaction each. */
async function setPrimaryNameFromOwner({
  name,
  ownerAddress,
  walletClient,
  publicClient,
  chainId,
  connector,
  onTxId,
}: SetPrimaryNameWithEthFallbackParams): Promise<void> {
  const cleanName = requireCanonicalPrimaryName(name)

  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, ownerAddress)
  ) {
    throw new Error(
      'Cannot set primary name - the connected wallet does not control the owner address.',
    )
  }

  const calls = primaryNameAdapterCalls(
    'owner',
    ownerAddress,
    cleanName,
    await hasStaleAddrReverse({ publicClient, ownerAddress }),
  )
  const signer: Signer = { type: 'eoa', walletClient, connector }

  for (const { to, data, value } of calls) {
    // Rechecked per transaction, so a name that stops resolving never clears addr.reverse.
    await assertPrimaryNameForwardResolution(
      publicClient,
      cleanName,
      ownerAddress,
    )
    const txId = transactionManager.startTransaction(
      {
        type: 'custom',
        request: { type: 'eoa', from: ownerAddress, to, data, value, chainId },
      },
      signer,
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
}

/** The HCA intent in USDC, or the owner's direct adapter calls in ETH when only ETH can pay. */
export async function setPrimaryNameWithEthFallback(
  params: SetPrimaryNameWithEthFallbackParams,
): Promise<void> {
  const payment = selectPrimaryNamePayment(
    await readPrimaryNamePaymentInputs(params),
  )
  return payment === 'usdc'
    ? setPrimaryNameWithHca(params)
    : setPrimaryNameFromOwner(params)
}
