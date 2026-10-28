import {
  type BuildHcaDeploymentCallParams,
  buildHcaDeploymentCall,
  buildHcaOwnerExecutionCall,
  type Call,
  verifyStandaloneHca,
} from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type PublicClient,
} from 'viem'
import type { Config as WagmiConfig } from 'wagmi'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'

/** The account only ever holds USDC: every intent is funded and paid in it. */
const LEFTOVER_TOKENS = [TOKENS.USDC]

/** The withdrawal could not be sent, or a transaction it sent reverted. */
export class LeftoverFundsWithdrawalError extends TaggedError(
  'LeftoverFundsWithdrawalError',
)<{
  readonly cause?: unknown
}> {}

export type LeftoverFund = {
  readonly token: Address
  readonly symbol: string
  readonly decimals: number
  readonly amount: bigint
}

export type LeftoverFunds = {
  /** False while the account has no code: withdrawing deploys it first. */
  readonly isDeployed: boolean
  /** Non-zero balances only. */
  readonly funds: readonly LeftoverFund[]
}

export const formatLeftoverFunds = (funds: readonly LeftoverFund[]): string =>
  funds
    .map(
      ({ amount, decimals, symbol }) =>
        `${formatUnits(amount, decimals)} ${symbol}`,
    )
    .join(', ')

/**
 * What the smart account holds after its payments. Registration funds it for
 * the highest quoted cost and spends only the actual one, so the rest stays.
 * A failed read rejects rather than dropping the token: a withdrawal built on
 * a partial read would leave that balance behind.
 */
export const readLeftoverFunds = async (
  publicClient: PublicClient,
  hca: Address,
): Promise<LeftoverFunds> => {
  const [code, amounts] = await Promise.all([
    publicClient.getCode({ address: hca }),
    Promise.all(
      LEFTOVER_TOKENS.map(({ address }) =>
        publicClient.readContract({
          address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [hca],
        }),
      ),
    ),
  ])
  return {
    isDeployed: Boolean(code && code !== '0x'),
    funds: LEFTOVER_TOKENS.flatMap(({ address, symbol, decimals }, index) => {
      const amount = amounts[index] ?? 0n
      return amount > 0n ? [{ token: address, symbol, decimals, amount }] : []
    }),
  }
}

/**
 * Gas for the `executeByOwner` withdrawal. Fixed for the same reason as
 * `REVOKE_SESSIONS_GAS_LIMIT`: a wallet in EIP-7702 mode forwards the estimate
 * to the inner call, which then runs out two delegatecalls deep.
 */
export const WITHDRAW_LEFTOVER_FUNDS_GAS_LIMIT = 250_000n

const send = async (
  wagmiConfig: WagmiConfig,
  owner: Address,
  call: Call,
  gas?: bigint,
): Promise<void> => {
  const hash = await sendTransaction(wagmiConfig, {
    account: owner,
    chainId: chain.id,
    to: call.to,
    data: call.data,
    value: call.value,
    ...(gas === undefined ? {} : { gas }),
  })
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId: chain.id,
  })
  if (receipt.status !== 'success') {
    throw new LeftoverFundsWithdrawalError({
      message: `Transaction ${hash} reverted`,
      cause: receipt,
    })
  }
}

export type WithdrawLeftoverFundsResult = {
  readonly withdrawn: readonly LeftoverFund[]
  /** True when this call had to deploy the account first. */
  readonly hasDeployedAccount: boolean
}

/**
 * Send every leftover balance back to the owner in one `executeByOwner`, a
 * direct owner transaction that costs gas. A session can't do this: its
 * validator only allows registration-shaped calls. An undeployed account
 * (funded by a bridge that landed before its first registration) is deployed
 * first, in a transaction of its own.
 */
export const withdrawLeftoverFunds = async (params: {
  readonly hca: Address
  readonly owner: Address
  readonly hcaClient: BuildHcaDeploymentCallParams['client'] | null
  readonly publicClient: PublicClient
  readonly wagmiConfig: WagmiConfig
}): Promise<WithdrawLeftoverFundsResult> => {
  const { hca, owner, hcaClient, publicClient, wagmiConfig } = params
  await ensureWalletChain(wagmiConfig, chain.id)

  // Read now, not from the cached query: transferring more than the balance
  // reverts, and less leaves dust behind.
  const { isDeployed, funds } = await readLeftoverFunds(publicClient, hca)
  if (funds.length === 0) return { withdrawn: [], hasDeployedAccount: false }

  if (!isDeployed) {
    if (!hcaClient) {
      throw new LeftoverFundsWithdrawalError({
        message: 'Smart account client is not ready',
      })
    }
    await send(
      wagmiConfig,
      owner,
      buildHcaDeploymentCall({
        client: hcaClient,
        chainId: chain.id,
        expectedHca: hca,
        expectedOwner: owner,
      }),
    )
  }
  // `executeByOwner` is `onlyOwner`; fail readably before the wallet opens.
  await verifyStandaloneHca({
    publicClient,
    hca,
    expectedOwner: owner,
    chainId: chain.id,
  })

  await send(
    wagmiConfig,
    owner,
    buildHcaOwnerExecutionCall({
      hca,
      calls: funds.map(({ token, amount }) => ({
        to: token,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [owner, amount],
        }),
      })),
    }),
    WITHDRAW_LEFTOVER_FUNDS_GAS_LIMIT,
  )
  return { withdrawn: funds, hasDeployedAccount: !isDeployed }
}
