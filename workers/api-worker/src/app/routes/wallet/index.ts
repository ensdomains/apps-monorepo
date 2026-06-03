import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { vValidator } from '@hono/valibot-validator'
import { HTTPException } from 'hono/http-exception'
import * as v from 'valibot'
import {
  createClient,
  erc20Abi,
  type Hex,
  http,
  maxUint256,
  multicall3Abi,
  publicActions,
  walletActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { encodeFunctionData, parseEther, parseUnits } from 'viem/utils'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { SEPOLIA_RPC_URL } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'
import { ethAddress } from '#utils/validation.js'

const TOKENS = {
  USDC: {
    address: ensL1Contracts[supportedL1Chains.sepolia].usdc.address,
    decimals: 6,
    mintAmount: parseUnits('1000', 6),
  },
  DAI: {
    address: ensL1Contracts[supportedL1Chains.sepolia].dai.address,
    decimals: 18,
    mintAmount: parseUnits('1000', 18),
  },
} as const

// ENS ETHRegistrar — the spender the payment token must be approved for.
const ETH_REGISTRAR =
  ensL1Contracts[supportedL1Chains.sepolia].ensEthRegistrar.address

// One-time "approve gas" drip.
//
// HCA registration is Warp-sponsored end to end EXCEPT the ERC-20 `approve`
// that lets the registrar pull the payment token from the name owner (the EOA).
// The registrar charges the owner, so the approve must be an EOA transaction;
// the deployed mock tokens have no EIP-2612 permit, so it can't be sponsored or
// relayed. The manager issues a *max* approve, so the owner needs a little ETH
// for that one approve — afterwards `allowance == max` and we never drip again.
//
// SECURITY NOTE: this hands a small amount of ETH to any address that hits the
// faucet. Acceptable for this testnet faucet only; remove once the protocol
// team ships permit-enabled mock tokens (the approve then becomes a gasless
// permit and the EOA never needs ETH).
const APPROVAL_GAS_ETH_TARGET = parseEther('0.005')
// A max approve sets the allowance to ~uint256 max; treat anything past half of
// that as "already approved" so the drip fires at most once per address.
const APPROVED_ALLOWANCE_THRESHOLD = maxUint256 / 2n

// Standard ERC-20 reads (balanceOf/allowance) use viem's `erc20Abi`. Only
// `mint` is non-standard (MockERC20 faucet helper, not part of `erc20Abi`),
// so it stays a local fragment.
const MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const createWalletClient = (privateKey: string | undefined) => {
  if (!privateKey || !privateKey.startsWith('0x')) {
    throw new HTTPException(500, {
      message: 'Server is not configured to fund wallets',
    })
  }

  const walletAccount = privateKeyToAccount(privateKey as Hex)
  logger.trace('Loaded wallet funding account', {
    walletAddress: walletAccount.address,
  })

  return createClient({
    chain: sepolia,
    // `batch: true` coalesces concurrent reads (the Promise.all below) into a
    // single JSON-RPC batch HTTP request — one round-trip without the on-chain
    // Multicall3 dependency, and native ETH reads as plain `eth_getBalance`.
    transport: http(SEPOLIA_RPC_URL, { batch: true }),
    account: walletAccount,
  })
    .extend(publicActions)
    .extend(walletActions)
}

export default createApp()
  .basePath('/wallet')
  .post(
    '/fund',
    injectDb,
    vValidator(
      'json',
      v.object({
        address: ethAddress,
      }),
    ),
    async (c) => {
      const { address } = c.req.valid('json')

      // Setup wallet
      const walletClient = createWalletClient(c.env.ETH_PRIVATE_KEY)

      // All reads go out in a single JSON-RPC batch (see `batch: true` on the
      // transport): both token balances, both registrar allowances (USDC and
      // DAI — approvals are per-token), and the native ETH balance.
      const [usdcBalance, daiBalance, usdcAllowance, daiAllowance, ethBalance] =
        await Promise.all([
          walletClient.readContract({
            address: TOKENS.USDC.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          }),
          walletClient.readContract({
            address: TOKENS.DAI.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          }),
          walletClient.readContract({
            address: TOKENS.USDC.address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, ETH_REGISTRAR],
          }),
          walletClient.readContract({
            address: TOKENS.DAI.address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, ETH_REGISTRAR],
          }),
          walletClient.getBalance({ address }),
        ])

      logger.debug('Checked faucet state', {
        usdcBalance,
        daiBalance,
        usdcAllowance,
        daiAllowance,
        ethBalance,
        address,
      })

      // 1) Mint mock USDC/DAI unless the address already has enough (anti-abuse).
      let txHash: Hex | null = null
      const hasEnoughTokens =
        usdcBalance >= TOKENS.USDC.mintAmount / 10n &&
        daiBalance >= TOKENS.DAI.mintAmount / 10n
      if (hasEnoughTokens) {
        logger.debug('Already have enough tokens, skipping mint', {
          usdcBalance,
          daiBalance,
          address,
        })
      } else {
        const multicallTxHash = await walletClient.writeContract({
          address: sepolia.contracts.multicall3.address,
          abi: multicall3Abi,
          functionName: 'aggregate3',
          args: [
            [
              {
                target: TOKENS.USDC.address,
                allowFailure: false,
                callData: encodeFunctionData({
                  abi: MINT_ABI,
                  functionName: 'mint',
                  args: [address, TOKENS.USDC.mintAmount],
                }),
              },
              {
                target: TOKENS.DAI.address,
                allowFailure: false,
                callData: encodeFunctionData({
                  abi: MINT_ABI,
                  functionName: 'mint',
                  args: [address, TOKENS.DAI.mintAmount],
                }),
              },
            ],
          ],
        })

        logger.debug('Mint multicall sent', {
          multicall: multicallTxHash,
          address,
        })

        const receipt = await walletClient.waitForTransactionReceipt({
          hash: multicallTxHash,
        })

        logger.debug('Mint multicall confirmed', { receipt, address })
        txHash = receipt.transactionHash
      }

      // 2) Drip a little ETH for the one-time registrar approve — ONLY when the
      // owner hasn't approved the registrar yet AND is low on ETH. The approve
      // is a non-sponsorable EOA tx (mock tokens have no permit); the manager
      // issues a max approve, so this is needed at most once per token.
      //
      // Gate on BOTH payment tokens: auto-fund runs before the user picks a
      // token and approvals are per-token (USDC vs DAI), so we keep topping up
      // approve-gas until the registrar is approved for every token the user
      // could pay with — otherwise a DAI registration could still run dry while
      // only USDC is approved. Each drip covers ~one approve; the manager
      // re-funds on low balance, so a user paying with both tokens is covered.
      const hasApprovedRegistrar =
        usdcAllowance >= APPROVED_ALLOWANCE_THRESHOLD &&
        daiAllowance >= APPROVED_ALLOWANCE_THRESHOLD
      if (hasApprovedRegistrar) {
        logger.debug(
          'Registrar approved for all payment tokens, skipping drip',
          {
            usdcAllowance,
            daiAllowance,
            address,
          },
        )
      } else if (ethBalance >= APPROVAL_GAS_ETH_TARGET) {
        logger.debug('Address has enough ETH for the approve, skipping drip', {
          ethBalance,
          address,
        })
      } else {
        const value = APPROVAL_GAS_ETH_TARGET - ethBalance
        try {
          const dripTxHash = await walletClient.sendTransaction({
            to: address,
            value,
          })
          logger.debug('Approve-gas ETH drip sent', {
            dripTxHash,
            value,
            address,
          })
          await walletClient.waitForTransactionReceipt({ hash: dripTxHash })
          logger.debug('Approve-gas ETH drip confirmed', {
            dripTxHash,
            address,
          })
        } catch (error) {
          // Best-effort: a failed drip must not fail token funding. The owner
          // can still be topped up from a faucet; log for debugging.
          logger.error('Approve-gas ETH drip failed', { address, error })
        }
      }

      // Preserve the two-shape response so the inferred hc type stays
      // `{ txHash: Hex } | { txHash: null }` (what the manager expects).
      return txHash ? c.json({ txHash }) : c.json({ txHash: null })
    },
  )
