import {
  type Address,
  type Hex,
  hexToSignature,
  maxUint256,
  type PublicClient,
  parseAbi,
  type WalletClient,
} from 'viem'
import { supportsPermit2612 } from './permit-support'

/**
 * The self-pay voucher (EnsCheckoutVoucher, stablecoin settlement).
 *
 * Deployed on Sepolia staging. A wallet paying its own way calls `mintSelf` /
 * `mintSelfWithPermit` directly — the same voucher Crossmint mints for card
 * payments, so both flows share the backend fulfilment pipeline. Overridable per
 * environment via VITE_VOUCHER_ADDRESS.
 */
export const VOUCHER_ADDRESS = (import.meta.env.VITE_VOUCHER_ADDRESS ??
  '0x6Fc426D667B49e3949ced241653aC2fb7721E8Ed') as Address

/** The self-pay surface the client calls, plus the read used to poll the mint. */
export const VOUCHER_ABI = parseAbi([
  'function mintSelf(bytes32 commitment, uint256 duration, address paymentToken, uint256 amount) returns (uint256 tokenId)',
  'function mintSelfWithPermit(bytes32 commitment, uint256 duration, address paymentToken, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256 tokenId)',
  'event VoucherMinted(uint256 indexed tokenId, address indexed to, bytes32 indexed commitment, uint256 duration, address paymentToken, uint256 amountPaid)',
])

/** Minimal ERC-20 surface for approve + the 2612 permit signing inputs. */
export const ERC20_PERMIT_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
])

/**
 * Mint the voucher from the connected wallet, paying `amount` of `token`. Uses
 * the one-tx EIP-2612 `mintSelfWithPermit` when the token supports permit
 * (detected on-chain), else falls back to `approve` + `mintSelf`. Waits for the
 * mint receipt and returns its hash. Keeps the dialog component thin.
 */
export async function mintVoucherFromWallet(params: {
  publicClient: PublicClient
  walletClient: WalletClient
  owner: Address
  token: Address
  amount: bigint
  commitment: Hex
  duration: bigint
}): Promise<Hex> {
  const { publicClient, owner, token } = params
  const canPermit = await supportsPermit2612(publicClient, token, owner)

  const mintHash = canPermit
    ? await mintWithPermit(params)
    : await approveThenMint(params)
  await publicClient.waitForTransactionReceipt({ hash: mintHash })
  return mintHash
}

async function mintWithPermit(params: {
  publicClient: PublicClient
  walletClient: WalletClient
  owner: Address
  token: Address
  amount: bigint
  commitment: Hex
  duration: bigint
}): Promise<Hex> {
  const {
    publicClient,
    walletClient,
    owner,
    token,
    amount,
    commitment,
    duration,
  } = params
  const [nonce, name] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: ERC20_PERMIT_ABI,
      functionName: 'nonces',
      args: [owner],
    }),
    publicClient.readContract({
      address: token,
      abi: ERC20_PERMIT_ABI,
      functionName: 'name',
    }),
  ])
  const signature = await walletClient.signTypedData({
    account: owner,
    domain: {
      name,
      version: '1',
      chainId: publicClient.chain?.id ?? 0,
      verifyingContract: token,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner,
      spender: VOUCHER_ADDRESS,
      value: amount,
      nonce,
      deadline: maxUint256,
    },
  })
  const { r, s, v } = hexToSignature(signature)
  return walletClient.writeContract({
    account: owner,
    chain: walletClient.chain,
    address: VOUCHER_ADDRESS,
    abi: VOUCHER_ABI,
    functionName: 'mintSelfWithPermit',
    args: [commitment, duration, token, amount, maxUint256, Number(v), r, s],
  })
}

async function approveThenMint(params: {
  publicClient: PublicClient
  walletClient: WalletClient
  owner: Address
  token: Address
  amount: bigint
  commitment: Hex
  duration: bigint
}): Promise<Hex> {
  const {
    publicClient,
    walletClient,
    owner,
    token,
    amount,
    commitment,
    duration,
  } = params
  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_PERMIT_ABI,
    functionName: 'allowance',
    args: [owner, VOUCHER_ADDRESS],
  })
  if (allowance < amount) {
    const approveHash = await walletClient.writeContract({
      account: owner,
      chain: walletClient.chain,
      address: token,
      abi: ERC20_PERMIT_ABI,
      functionName: 'approve',
      args: [VOUCHER_ADDRESS, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }
  return walletClient.writeContract({
    account: owner,
    chain: walletClient.chain,
    address: VOUCHER_ADDRESS,
    abi: VOUCHER_ABI,
    functionName: 'mintSelf',
    args: [commitment, duration, token, amount],
  })
}
