import {
  type Address,
  bytesToHex,
  type EIP1193Provider,
  type Hex,
  type LocalAccount,
  numberToHex,
  type TransactionSerializable,
} from 'viem'
import { toAccount } from 'viem/accounts'

/**
 * Adapt a Privy embedded wallet into a viem `LocalAccount`.
 *
 * Privy does not hand out a `LocalAccount`; it exposes an EIP-1193 provider
 * per embedded wallet (`wallet.getEthereumProvider()`). We bridge the gap with
 * viem's `toAccount`, routing each account operation to the equivalent RPC call
 * on Privy's provider. Privy's embedded provider executes these locally in its
 * origin-isolated iframe (the key shard never leaves it), so the result behaves
 * like a local account from the caller's perspective.
 *
 * What this adapter does NOT provide (matters for the Rhinestone SCA step):
 *   - raw `sign({ hash })` (ERC-4337 userOp hashes) — not on Privy's EIP-1193
 *     surface. Privy ships a dedicated raw-sign API for this; wiring it is a
 *     Rhinestone-layer task (handoff §4.4).
 *   - `signAuthorization` (EIP-7702) — via Privy's own `useSignAuthorization`
 *     hook, not the generic provider.
 */
export async function privyAccountFromProvider(
  provider: EIP1193Provider,
  address: Address,
): Promise<LocalAccount> {
  const account = toAccount({
    address,

    async signMessage({ message }) {
      const data: Hex =
        typeof message === 'string'
          ? bytesToHex(new TextEncoder().encode(message))
          : typeof message.raw === 'string'
            ? message.raw
            : bytesToHex(message.raw)
      return (await provider.request({
        method: 'personal_sign',
        params: [data, address],
      })) as Hex
    },

    async signTypedData(typedData) {
      return (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as Hex
    },

    async signTransaction(transaction) {
      // viem hands us a prepared TransactionSerializable (bigint quantities);
      // Privy's provider speaks RPC (hex quantities).
      const rpcTx = serializableToRpc(transaction, address)
      return (await provider.request({
        method: 'eth_signTransaction',
        // Privy's eth_signTransaction takes a single tx param object.
        params: [rpcTx] as never,
      })) as Hex
    },
  })

  // `toAccount` marks the result as source: "custom"; it satisfies LocalAccount
  // structurally.
  return account as LocalAccount
}

function serializableToRpc(
  tx: TransactionSerializable,
  from: Address,
): Record<string, unknown> {
  const out: Record<string, unknown> = { from }
  if (tx.to != null) out.to = tx.to
  if (tx.data != null) out.data = tx.data
  if (tx.nonce != null) out.nonce = numberToHex(tx.nonce)
  if (tx.value != null) out.value = numberToHex(tx.value)
  if (tx.gas != null) out.gas = numberToHex(tx.gas)
  if (tx.chainId != null) out.chainId = numberToHex(tx.chainId)
  if ('maxFeePerGas' in tx && tx.maxFeePerGas != null)
    out.maxFeePerGas = numberToHex(tx.maxFeePerGas)
  if ('maxPriorityFeePerGas' in tx && tx.maxPriorityFeePerGas != null)
    out.maxPriorityFeePerGas = numberToHex(tx.maxPriorityFeePerGas)
  if ('gasPrice' in tx && tx.gasPrice != null)
    out.gasPrice = numberToHex(tx.gasPrice)
  if (tx.type != null) out.type = tx.type
  return out
}
