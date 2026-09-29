import type { V1Domain } from '@ens-apps/migration'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { baseRegistrarNameExpiresSnippet } from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  ethRegistrarGetRenewPriceSnippet,
  ethRegistrarIsRenewableSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { fromPromise } from 'neverthrow'
import {
  type Address,
  BaseError,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  type Hex,
  isAddressEqual,
  numberToHex,
  type PublicClient,
  parseAbi,
  type WalletClient,
  zeroAddress,
  zeroHash,
} from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { containsNodeError, getNodeError } from 'viem/utils'
import { chain } from '@/config'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import { getRenewerAddress } from '@/features/renew/utils/renewalProtocol'
import { TOKENS } from '@/lib/tokens'
import { V1_CONTRACTS } from '../contracts/addresses'
import {
  clearPendingGraceRenewal,
  type PendingGraceRenewal,
  pendingGraceRenewalForQuote,
  readPendingGraceRenewal,
  withGraceRenewalLock,
  writePendingGraceRenewal,
} from './graceRenewalPending'

const GRACE_PERIOD = BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)
export const GRACE_RENEWAL_EXTENSION = 7n * BigInt(SECONDS_PER_DAY)
const QUOTE_LIFETIME = 300n

// TODO(ensjs): upstream the batch and minimum-duration snippets. ETHRenewerV1
// implements IETHRenewer.renewBatch and syncs NameWrapper within that transaction.
export const GRACE_RENEWAL_ABI = parseAbi([
  'function renewBatch((string label, uint64 duration, bytes32 referrer)[] rds, address paymentToken)',
  'function MIN_RENEW_DURATION() view returns (uint64)',
])
const REGISTRY_OWNER_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
])

export class GraceRenewalError extends TaggedError('GraceRenewalError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : 'Could not renew your names. Please try again.'
  }
}

export type GraceRenewalItem = {
  readonly domain: V1Domain
  readonly label: string
  readonly registrationExpiry: bigint
  readonly duration: bigint
  readonly targetExpiry: bigint
  readonly amount: bigint
}

export type GraceRenewalQuote = {
  readonly ownerAddress: Address
  readonly chainId: number
  readonly paymentToken: Address
  readonly renewerAddress: Address
  readonly items: readonly GraceRenewalItem[]
  readonly totalAmount: bigint
  readonly balance: bigint
  readonly expiresAt: bigint
  readonly quotedAtMs: number
}

type ReadDomainsParameters = {
  readonly domains: readonly V1Domain[]
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
}

const assertChain = (publicClient: PublicClient): void => {
  if (publicClient.chain?.id !== chain.id) {
    throw new Error('Switch to the migration network and try again.')
  }
}

const getLabel = (domain: V1Domain): string => {
  const result = resolveRenewalLabel(domain.name)
  if (
    result.isErr() ||
    namehash(domain.name).toLowerCase() !== domain.id.toLowerCase() ||
    labelhash(result.value).toLowerCase() !== domain.labelhash.toLowerCase()
  ) {
    throw new Error(`Could not verify the name ${domain.name}.`)
  }
  return result.value
}

const getExpiry = (domain: V1Domain): bigint =>
  BigInt(domain.registration?.expiryDate ?? '0')

const assertNameOwner = (params: {
  readonly domain: V1Domain
  readonly wrappedOwner: Address
  readonly registrant: string | undefined
  readonly ownerAddress: Address
  readonly isWrapped: boolean
}): void => {
  const { domain, wrappedOwner, registrant, ownerAddress, isWrapped } = params
  const nameOwner = isWrapped ? wrappedOwner : registrant
  const hasWrapperRegistrant =
    !!registrant &&
    isAddressEqual(registrant as Address, V1_CONTRACTS.NameWrapper)
  if (
    !nameOwner ||
    !isAddressEqual(nameOwner as Address, ownerAddress) ||
    (isWrapped && !hasWrapperRegistrant)
  ) {
    throw new Error(`${domain.name} is no longer owned by this wallet.`)
  }
}

const readDomains = async (
  { domains, ownerAddress, publicClient }: ReadDomainsParameters,
  block: { readonly number: bigint; readonly timestamp: bigint },
): Promise<readonly V1Domain[]> => {
  assertChain(publicClient)
  return Promise.all(
    domains.map(async (domain): Promise<V1Domain> => {
      const label = getLabel(domain)
      const tokenId = BigInt(labelhash(label))
      const node = namehash(domain.name)
      const [expiry, wrapperData, registryOwner] = await Promise.all([
        publicClient.readContract({
          address: V1_CONTRACTS.BaseRegistrar,
          abi: baseRegistrarNameExpiresSnippet,
          functionName: 'nameExpires',
          args: [tokenId],
          blockNumber: block.number,
        }),
        publicClient.readContract({
          address: V1_CONTRACTS.NameWrapper,
          abi: nameWrapperGetDataSnippet,
          functionName: 'getData',
          args: [BigInt(node)],
          blockNumber: block.number,
        }),
        publicClient.readContract({
          address: V1_CONTRACTS.LegacyRegistry,
          abi: REGISTRY_OWNER_ABI,
          functionName: 'owner',
          args: [node],
          blockNumber: block.number,
        }),
      ])
      if (expiry === 0n || block.timestamp >= expiry + GRACE_PERIOD) {
        throw new Error(`${domain.name} is no longer in its grace period.`)
      }

      const [wrappedOwner, fuses, wrappedExpiry] = wrapperData
      const isWrapped = !isAddressEqual(wrappedOwner, zeroAddress)
      // BaseRegistrar.ownerOf intentionally reverts during grace. Transfers are
      // frozen then, so retain the indexed registrant; after renewal we require
      // the authoritative ownerOf result before building any migration calls.
      const registrant =
        expiry > block.timestamp
          ? await publicClient.readContract({
              address: V1_CONTRACTS.BaseRegistrar,
              abi: erc721Abi,
              functionName: 'ownerOf',
              args: [tokenId],
              blockNumber: block.number,
            })
          : isWrapped
            ? V1_CONTRACTS.NameWrapper
            : domain.registrant?.id
      assertNameOwner({
        domain,
        wrappedOwner,
        registrant,
        ownerAddress,
        isWrapped,
      })
      return {
        ...domain,
        owner: { id: registryOwner },
        registrant: registrant ? { id: registrant } : null,
        registration: { expiryDate: expiry.toString() },
        wrappedOwner: isWrapped ? { id: wrappedOwner } : null,
        wrappedDomain: isWrapped
          ? { expiryDate: wrappedExpiry.toString(), fuses }
          : null,
      }
    }),
  )
}

export const readGraceRenewalDomains = (params: ReadDomainsParameters) =>
  fromPromise(
    params.publicClient
      .getBlock({ blockTag: 'latest' })
      .then((block) => readDomains(params, block)),
    (cause) => new GraceRenewalError({ cause }),
  )

export const getGraceRenewalDuration = (
  expiry: bigint,
  now: bigint,
  minimumDuration: bigint,
): bigint => {
  if (expiry > now) return 0n
  const duration = now - expiry + GRACE_RENEWAL_EXTENSION
  return duration > minimumDuration ? duration : minimumDuration
}

export const getGraceRenewalQuote = (params: ReadDomainsParameters) =>
  fromPromise(
    (async (): Promise<GraceRenewalQuote> => {
      assertChain(params.publicClient)
      if (
        params.domains.length === 0 ||
        new Set(params.domains.map(({ id }) => id.toLowerCase())).size !==
          params.domains.length
      ) {
        throw new Error('Select the names you want to renew.')
      }
      const { publicClient, ownerAddress } = params
      const renewerAddress = getRenewerAddress('v1')
      const paymentToken = TOKENS.USDC.address
      const block = await publicClient.getBlock({ blockTag: 'latest' })
      const [domains, minimumDuration, balance] = await Promise.all([
        readDomains(params, block),
        publicClient.readContract({
          address: renewerAddress,
          abi: GRACE_RENEWAL_ABI,
          functionName: 'MIN_RENEW_DURATION',
          blockNumber: block.number,
        }),
        publicClient.readContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [ownerAddress],
          blockNumber: block.number,
        }),
      ])
      const items = await Promise.all(
        domains.map(async (domain): Promise<GraceRenewalItem> => {
          const label = getLabel(domain)
          const registrationExpiry = BigInt(
            domain.registration?.expiryDate ?? '0',
          )
          const duration = getGraceRenewalDuration(
            registrationExpiry,
            block.timestamp,
            minimumDuration,
          )
          if (duration === 0n) {
            return {
              domain,
              label,
              registrationExpiry,
              duration,
              targetExpiry: registrationExpiry,
              amount: 0n,
            }
          }
          const renewable = await publicClient.readContract({
            address: renewerAddress,
            abi: ethRegistrarIsRenewableSnippet,
            functionName: 'isRenewable',
            args: [label],
            blockNumber: block.number,
          })
          if (!renewable)
            throw new Error(`${domain.name} cannot be renewed here.`)
          const amount = await publicClient.readContract({
            address: renewerAddress,
            abi: ethRegistrarGetRenewPriceSnippet,
            functionName: 'getRenewPrice',
            args: [label, duration, paymentToken],
            blockNumber: block.number,
          })
          return {
            domain,
            label,
            registrationExpiry,
            duration,
            targetExpiry: registrationExpiry + duration,
            amount,
          }
        }),
      )
      return {
        ownerAddress,
        chainId: chain.id,
        renewerAddress,
        paymentToken,
        items,
        totalAmount: items.reduce((total, item) => total + item.amount, 0n),
        balance,
        quotedAtMs: Date.now(),
        expiresAt: items.reduce(
          (end, item) =>
            item.duration > 0n && item.registrationExpiry + GRACE_PERIOD < end
              ? item.registrationExpiry + GRACE_PERIOD
              : end,
          block.timestamp + QUOTE_LIFETIME,
        ),
      }
    })(),
    (cause) => new GraceRenewalError({ cause }),
  )

const getRenewalArgs = (quote: GraceRenewalQuote) =>
  [
    quote.items
      .filter(({ duration }) => duration > 0n)
      .map(({ label, duration }) => ({
        label,
        duration,
        referrer: zeroHash,
      })),
    quote.paymentToken,
  ] as const

export const encodeGraceRenewal = (quote: GraceRenewalQuote): Hex =>
  encodeFunctionData({
    abi: GRACE_RENEWAL_ABI,
    functionName: 'renewBatch',
    args: getRenewalArgs(quote),
  })

export type GraceRenewalStatus =
  | 'approving'
  | 'approval-confirming'
  | 'approval-complete'
  | 'renewing'
  | 'confirming'

type ExecuteGraceRenewalParameters = {
  readonly quote: GraceRenewalQuote
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly renewalHash?: Hex
  readonly signal?: AbortSignal
  readonly onStatus?: (status: GraceRenewalStatus) => void
  readonly onApprovalRequired?: (required: boolean) => void
  readonly onRenewalSubmitted?: (hash: Hex) => void
}

const assertWallet = async ({
  quote,
  publicClient,
  walletClient,
  signal,
}: ExecuteGraceRenewalParameters): Promise<void> => {
  signal?.throwIfAborted()
  assertChain(publicClient)
  const [walletChainId, addresses] = await Promise.all([
    walletClient.getChainId(),
    walletClient.getAddresses(),
  ])
  if (
    quote.chainId !== chain.id ||
    walletChainId !== quote.chainId ||
    !addresses[0] ||
    !isAddressEqual(addresses[0], quote.ownerAddress) ||
    !isAddressEqual(quote.renewerAddress, getRenewerAddress('v1')) ||
    !isAddressEqual(quote.paymentToken, TOKENS.USDC.address)
  )
    throw new Error('Reconnect the wallet and network used for this renewal.')
  signal?.throwIfAborted()
}

const waitForRenewal = async (
  params: ExecuteGraceRenewalParameters,
  pending: PendingGraceRenewal & { readonly hash: Hex },
): Promise<void> => {
  params.onStatus?.('confirming')
  const receipt = await params.publicClient.waitForTransactionReceipt({
    hash: pending.hash,
    onReplaced: ({ reason, transaction }) => {
      if (reason !== 'repriced') {
        clearPendingGraceRenewal(pending)
        throw new Error(
          'The renewal transaction was replaced. Return to name selection to check its status.',
        )
      }
      writePendingGraceRenewal({ ...pending, hash: transaction.hash })
      params.onRenewalSubmitted?.(transaction.hash)
    },
  })
  if (receipt.status !== 'success') {
    clearPendingGraceRenewal(pending)
    throw new Error(
      'The renewal transaction reverted. Return to name selection to try again.',
    )
  }
}

const pendingTargetsReached = async (
  publicClient: PublicClient,
  pending: PendingGraceRenewal,
): Promise<boolean> => {
  const block = await publicClient.getBlock({ blockTag: 'latest' })
  const expiries = await Promise.all(
    pending.items.map((item) => {
      const label = resolveRenewalLabel(item.name)
      if (label.isErr()) throw label.error
      return publicClient.readContract({
        address: V1_CONTRACTS.BaseRegistrar,
        abi: baseRegistrarNameExpiresSnippet,
        functionName: 'nameExpires',
        args: [BigInt(labelhash(label.value))],
        blockNumber: block.number,
      })
    }),
  )
  return expiries.every(
    (expiry, index) => expiry >= (pending.items[index]?.targetExpiry ?? 0n),
  )
}

const reconcilePendingRenewal = async (
  params: ExecuteGraceRenewalParameters,
  pending: PendingGraceRenewal,
): Promise<readonly V1Domain[]> => {
  if (pending.hash) {
    params.onRenewalSubmitted?.(pending.hash)
    await waitForRenewal(params, { ...pending, hash: pending.hash })
  }
  if (!(await pendingTargetsReached(params.publicClient, pending))) {
    throw new Error(
      'A previous renewal is still unresolved. Check its wallet transaction before trying again.',
    )
  }
  clearPendingGraceRenewal(pending)
  const targets = new Map(
    pending.items.map((item) => [item.id.toLowerCase(), item.targetExpiry]),
  )
  const matchesSelection =
    params.quote.items.length === pending.items.length &&
    params.quote.items.every(({ domain }) =>
      targets.has(domain.id.toLowerCase()),
    )
  if (!matchesSelection) {
    throw new Error(
      'Your previous renewal completed. Return to name selection to update this quote.',
    )
  }
  const recoveredQuote = {
    ...params.quote,
    items: params.quote.items.map((item) => ({
      ...item,
      targetExpiry:
        targets.get(item.domain.id.toLowerCase()) ?? item.targetExpiry,
    })),
  }
  const block = await params.publicClient.getBlock({ blockTag: 'latest' })
  const domains = await readDomains(
    {
      domains: recoveredQuote.items.map(({ domain }) => domain),
      ownerAddress: recoveredQuote.ownerAddress,
      publicClient: params.publicClient,
    },
    block,
  )
  assertRenewed(domains, recoveredQuote, block.timestamp)
  return domains
}

const validateGraceRenewal = async (
  params: ExecuteGraceRenewalParameters,
  readParams: ReadDomainsParameters,
): Promise<readonly V1Domain[]> => {
  const { quote, publicClient } = params
  await assertWallet(params)
  const block = await publicClient.getBlock({ blockTag: 'latest' })
  const domains = await readDomains(readParams, block)
  if (hasReachedTargets(domains, quote)) {
    assertRenewed(domains, quote, block.timestamp)
    return domains
  }
  if (
    block.timestamp >= quote.expiresAt ||
    Date.now() - quote.quotedAtMs >= Number(QUOTE_LIFETIME) * 1000
  ) {
    throw new Error(
      'The renewal quote expired. Return to name selection for a fresh quote.',
    )
  }
  if (
    domains.some(
      (domain, index) =>
        getExpiry(domain) !== quote.items[index]?.registrationExpiry,
    )
  ) {
    throw new Error(
      'A name was renewed elsewhere. Return to name selection to update the quote.',
    )
  }
  const amounts = await Promise.all(
    quote.items
      .filter(({ duration }) => duration > 0n)
      .map((item) =>
        publicClient.readContract({
          address: quote.renewerAddress,
          abi: ethRegistrarGetRenewPriceSnippet,
          functionName: 'getRenewPrice',
          args: [item.label, item.duration, quote.paymentToken],
          blockNumber: block.number,
        }),
      ),
  )
  const balance = await publicClient.readContract({
    address: quote.paymentToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [quote.ownerAddress],
    blockNumber: block.number,
  })
  if (amounts.reduce((total, amount) => total + amount, 0n) > quote.totalAmount)
    throw new Error(
      'The renewal price changed. Return to name selection for a fresh quote.',
    )
  if (balance < quote.totalAmount)
    throw new Error('Your wallet needs more USDC to renew these names.')
  return domains
}

const submitGraceRenewal = async (
  params: ExecuteGraceRenewalParameters,
): Promise<PendingGraceRenewal & { readonly hash: Hex }> => {
  const { quote } = params
  params.onStatus?.('renewing')
  const submitting = pendingGraceRenewalForQuote(quote)
  // Save before opening the wallet: a reload can lose the hash response even
  // when the wallet already broadcast the transaction.
  writePendingGraceRenewal(submitting)
  const submission = await fromPromise(
    // Send once: writeContract can retry an ambiguous eth_sendTransaction
    // failure through wallet_sendTransaction and hide the original error.
    params.walletClient.request(
      {
        method: 'eth_sendTransaction',
        params: [
          {
            from: quote.ownerAddress,
            to: quote.renewerAddress,
            chainId: numberToHex(quote.chainId),
            data: encodeGraceRenewal(quote),
          },
        ],
      },
      { retryCount: 0 },
    ),
    (cause) => cause,
  )
  if (submission.isErr()) {
    if (hasDefinitiveSubmissionFailure(submission.error))
      clearPendingGraceRenewal(quote)
    throw submission.error
  }
  const hash = submission.value
  const submitted = { ...submitting, hash }
  writePendingGraceRenewal(submitted)
  return submitted
}

export const executeGraceRenewal = (params: ExecuteGraceRenewalParameters) =>
  fromPromise(
    withGraceRenewalLock(
      params.quote,
      async (): Promise<readonly V1Domain[]> => {
        const { quote, publicClient, walletClient, signal } = params
        await assertWallet(params)
        const readParams = {
          domains: quote.items.map(({ domain }) => domain),
          ownerAddress: quote.ownerAddress,
          publicClient,
        }
        const stored = readPendingGraceRenewal(quote)
        const pending =
          stored ??
          (params.renewalHash
            ? pendingGraceRenewalForQuote(quote, params.renewalHash)
            : null)
        if (pending) {
          writePendingGraceRenewal(pending)
          return reconcilePendingRenewal(params, pending)
        }

        let domains = await validateGraceRenewal(params, readParams)
        if (hasReachedTargets(domains, quote)) return domains
        const allowance = await publicClient.readContract({
          address: quote.paymentToken,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [quote.ownerAddress, quote.renewerAddress],
        })
        const approvalRequired = allowance < quote.totalAmount
        params.onApprovalRequired?.(approvalRequired)
        if (approvalRequired) {
          params.onStatus?.('approving')
          await assertWallet(params)
          const approvalHash = await walletClient.writeContract({
            account: quote.ownerAddress,
            chain: publicClient.chain,
            address: quote.paymentToken,
            abi: erc20Abi,
            functionName: 'approve',
            args: [quote.renewerAddress, quote.totalAmount],
          })
          params.onStatus?.('approval-confirming')
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          })
          if (receipt.status !== 'success')
            throw new Error('USDC approval reverted. Please try again.')
          params.onStatus?.('approval-complete')
          domains = await validateGraceRenewal(params, readParams)
          if (hasReachedTargets(domains, quote)) return domains
        }
        signal?.throwIfAborted()
        const args = getRenewalArgs(quote)
        await publicClient.simulateContract({
          account: quote.ownerAddress,
          address: quote.renewerAddress,
          abi: GRACE_RENEWAL_ABI,
          functionName: 'renewBatch',
          args,
        })
        await assertWallet(params)
        const submitted = await submitGraceRenewal(params)
        domains = await reconcilePendingRenewal(params, submitted)
        return domains
      },
    ),
    (cause) => new GraceRenewalError({ cause }),
  )

const DEFINITIVE_SUBMISSION_ERROR_CODES = new Set([
  4001, // User rejected the request.
  4100, // Account or method is not authorized.
  4200, // Provider does not support the method.
  -32700, // Invalid JSON.
  -32600, // Invalid request.
  -32601, // Method not found.
  -32602, // Invalid parameters.
  -32004, // Method not supported.
])

const DEFINITIVE_SUBMISSION_ERROR_NAMES = new Set([
  'UserRejectedRequestError',
  'AccountNotFoundError',
  'AccountTypeNotSupportedError',
  'ChainMismatchError',
  'ChainNotFoundError',
  'ClientChainNotConfiguredError',
  'InvalidChainIdError',
  'InvalidAddressError',
  'InsufficientFundsError',
  'FeeCapTooHighError',
  'FeeCapTooLowError',
  'TipAboveFeeCapError',
  'IntrinsicGasTooHighError',
  'IntrinsicGasTooLowError',
  'TransactionTypeNotSupportedError',
  'ExecutionRevertedError',
])

const hasDefinitiveSubmissionFailure = (error: unknown): boolean => {
  // Only discard the reservation when the wallet/node explicitly refused the
  // request. Timeouts, disconnects, and generic RPC errors can lose a broadcast
  // hash; even -32000 can mean "already known", so those must be reconciled.
  const seen = new Set<unknown>()
  let cause = error
  while (cause && typeof cause === 'object' && !seen.has(cause)) {
    seen.add(cause)
    if (
      'code' in cause &&
      typeof cause.code === 'number' &&
      DEFINITIVE_SUBMISSION_ERROR_CODES.has(cause.code)
    )
      return true
    if (
      cause instanceof BaseError &&
      containsNodeError(cause) &&
      DEFINITIVE_SUBMISSION_ERROR_NAMES.has(getNodeError(cause, {}).name)
    )
      return true
    if (
      'name' in cause &&
      typeof cause.name === 'string' &&
      DEFINITIVE_SUBMISSION_ERROR_NAMES.has(cause.name)
    )
      return true
    cause = 'cause' in cause ? cause.cause : undefined
  }
  return false
}

const hasReachedTargets = (
  domains: readonly V1Domain[],
  quote: GraceRenewalQuote,
): boolean =>
  domains.length === quote.items.length &&
  domains.every(
    (domain, index) =>
      getExpiry(domain) >= (quote.items[index]?.targetExpiry ?? 0n),
  )

const assertRenewed = (
  domains: readonly V1Domain[],
  quote: GraceRenewalQuote,
  nowSeconds: bigint,
): void => {
  if (!hasReachedTargets(domains, quote))
    throw new Error(
      'Could not confirm the renewed expiry. Retry to check the same transaction.',
    )
  if (domains.some((domain) => getExpiry(domain) <= nowSeconds)) {
    throw new Error(
      'A renewed name has expired again. Return to name selection for a fresh quote.',
    )
  }
  if (
    domains.some(
      (domain) =>
        domain.wrappedDomain &&
        BigInt(domain.wrappedDomain.expiryDate) <
          getExpiry(domain) + GRACE_PERIOD,
    )
  ) {
    throw new Error(
      'Could not confirm the renewed wrapper expiry. Retry to check the same transaction.',
    )
  }
}
