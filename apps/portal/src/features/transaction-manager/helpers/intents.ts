import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  type WalletClient,
} from 'viem'

/**
 * Builds the standard EOA {@link CustomTransactionIntent} that every
 * `prepare*Transaction` builder returns. Centralizing the wrapper means the
 * intent contract (the `value: 0n` default, the request field set) lives in one
 * place instead of being hand-rolled at every builder — change it here once
 * rather than hunting ~20 identical object literals.
 */
export function toEoaCustomIntent(params: {
  readonly from: Address
  readonly to: Address
  readonly data: Hex
  readonly chainId: number
  /** Defaults to `0n` — the overwhelming majority of ENS writes send no ETH. */
  readonly value?: bigint
  /** Explicit gas cap for calls where live estimation is unreliable. */
  readonly gas?: bigint
}): CustomTransactionIntent {
  return {
    type: 'custom',
    request: {
      type: 'eoa',
      from: params.from,
      to: params.to,
      data: params.data,
      value: params.value ?? 0n,
      chainId: params.chainId,
      ...(params.gas != null ? { gas: params.gas } : {}),
    },
  }
}

/**
 * Several EOA intents as one atomic EIP-5792 bundle, executed in order — one
 * wallet confirmation. Per-call gas caps are dropped: the wallet estimates the
 * bundle as a whole. Only build one when the wallet reports atomic support.
 */
export function toEoaBatchIntent(
  intents: readonly CustomTransactionIntent[],
): CustomTransactionIntent {
  const requests = intents.map(({ request }) => request)
  const [first] = requests
  if (!first) throw new Error('A bundle needs at least one call')
  const calls = requests.map((request) => {
    if (
      request.type !== 'eoa' ||
      !isAddressEqual(request.from, first.from) ||
      request.chainId !== first.chainId
    ) {
      throw new Error('Only EOA calls from one account and chain can bundle')
    }
    return {
      to: request.to,
      data: request.data ?? '0x',
      value: request.value ?? 0n,
    }
  })
  return {
    type: 'custom',
    request: {
      type: 'eoa-batch',
      from: first.from,
      chainId: first.chainId,
      calls,
    },
  }
}

/**
 * {@link toEoaCustomIntent} sent from the wallet's own account, which the
 * `prepare*Transaction` builders require before they encode anything.
 */
export function toEoaIntent(
  walletClient: WalletClient,
  params: {
    readonly to: Address
    readonly data: Hex
    readonly chainId: number
  },
): CustomTransactionIntent {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }
  return toEoaCustomIntent({ from: walletClient.account.address, ...params })
}

/**
 * The ERC-20 `approve` intent shared by both the pre-start gas estimate and the
 * submit path, so the estimated call is byte-identical to what's sent. The
 * `amount` is the caller's choice (registration and renewal both approve the
 * exact price) — only the encoding is shared, since `approve` gas is
 * amount-independent.
 */
export function buildApproveIntent(params: {
  readonly from: Address
  readonly token: Address
  readonly spender: Address
  readonly amount: bigint
  readonly chainId: number
}): CustomTransactionIntent {
  return toEoaCustomIntent({
    from: params.from,
    to: params.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spender, params.amount],
    }),
    chainId: params.chainId,
  })
}
