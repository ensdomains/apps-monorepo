import type {
  Account,
  Address,
  HashTypedDataParameters,
  Hex,
  SignableMessage,
  TypedData,
  TypedDataDefinition,
  WalletClient,
} from 'viem'

/**
 * Error thrown when wallet client has no connected account
 */
export class WalletClientNoConnectedAccountError extends Error {
  constructor() {
    super('Wallet client has no connected account')
    this.name = 'WalletClientNoConnectedAccountError'
  }
}

/**
 * Adapts a Viem/Wagmi WalletClient into an Account-like signer that the SDK can consume.
 * Ensures address is set and routes sign methods through the provided client.
 */
export function walletClientToAccount(walletClient: WalletClient): Account {
  const address = walletClient.account?.address as Address | undefined

  if (!address) {
    throw new WalletClientNoConnectedAccountError()
  }

  const account = {
    address,
    async signMessage({
      message,
    }: {
      message: Parameters<WalletClient['signMessage']>[0]['message']
    }): Promise<Hex> {
      return walletClient.signMessage({ account: address, message })
    },
    async signTypedData<
      typedData extends TypedData | Record<string, unknown> = TypedData,
      primaryType extends keyof typedData | 'EIP712Domain' = keyof typedData,
    >(
      parameters: HashTypedDataParameters<typedData, primaryType>,
    ): Promise<Hex> {
      const def = parameters as unknown as TypedDataDefinition<
        typedData,
        primaryType
      >
      const signature = (
        walletClient as unknown as {
          signTypedData: (args: Record<string, unknown>) => Promise<Hex>
        }
      ).signTypedData({
        account: address,
        ...def,
      })
      return signature
    },
    async signTransaction(transaction: Record<string, unknown>): Promise<Hex> {
      return (
        walletClient as unknown as {
          signTransaction: (args: Record<string, unknown>) => Promise<Hex>
        }
      ).signTransaction({
        account: address,
        ...transaction,
      })
    },
  } as unknown as Account

  return account
}

/**
 * Wraps a Para viem account with custom signing for Rhinestone compatibility.
 *
 * Para's MPC signatures use 0/1 v-byte recovery, but Rhinestone/Smart wallets
 * expect 27/28 v-byte recovery. This wrapper adjusts Para signatures automatically.
 *
 * @param viemAccount - The Para viem account to wrap
 * @param walletId - Optional wallet ID for Para signing operations
 * @returns Account compatible with Rhinestone SDK
 *
 * @example
 * ```ts
 * const paraAccount = // ... Para viem account
 * const wrappedAccount = wrapParaAccount(paraAccount, wallet.id)
 *
 * const rhinestoneAccount = await rhinestone.createAccount({
 *   owners: {
 *     type: "ecdsa",
 *     accounts: [wrappedAccount],
 *   },
 * })
 *
 * // Also works for EIP-7702 (signAuthorization uses original 0/1 v-byte)
 * const authorization = await wrappedAccount.signAuthorization?.({ ... })
 * ```
 */
export function wrapParaAccount(
  viemAccount: Account,
  walletId?: string,
): Account {
  const effectiveWalletId =
    walletId ||
    (viemAccount as unknown as Record<string, unknown>).walletId ||
    (viemAccount as unknown as Record<string, unknown>)._walletId

  if (effectiveWalletId) {
    ;(viemAccount as unknown as Record<string, unknown>)._paraWalletId =
      effectiveWalletId
  }

  return {
    ...viemAccount,
    signMessage: async ({ message }: { message: SignableMessage }) => {
      if (!viemAccount.signMessage) {
        throw new Error('Account does not support signMessage')
      }
      const originalSignature = await viemAccount.signMessage({ message })
      return adjustVByte(originalSignature)
    },
    signTypedData: async <
      const TTypedData extends TypedData | Record<string, unknown>,
      TPrimaryType extends keyof TTypedData | 'EIP712Domain' = keyof TTypedData,
    >(
      typedData: TypedDataDefinition<TTypedData, TPrimaryType>,
    ) => {
      if (!viemAccount.signTypedData) {
        throw new Error('Account does not support signTypedData')
      }
      // Serialize the typed data message contents
      // This ensures that large bigint values (e.g., intent nonce) are properly passed
      // to the wallet during signing
      const serializedTypedData: TypedDataDefinition<TTypedData, TPrimaryType> =
        {
          ...typedData,
          message: convertBigIntsToStrings(typedData.message) as Record<
            string,
            unknown
          >,
        }
      const originalSignature =
        await viemAccount.signTypedData(serializedTypedData)
      return adjustVByte(originalSignature)
    },
    signAuthorization: viemAccount.signAuthorization
      ? viemAccount.signAuthorization.bind(viemAccount)
      : undefined,
  } as Account
}

/**
 * Adjusts the v-byte in a signature from Para's 0/1 format to Ethereum's 27/28 format.
 * @internal
 */
function adjustVByte(signature: string): Hex {
  const V_OFFSET_FOR_ETHEREUM = 27

  const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature
  const r = cleanSig.slice(0, 64)
  const s = cleanSig.slice(64, 128)
  let v = parseInt(cleanSig.slice(128, 130), 16)

  if (v < 27) {
    v += V_OFFSET_FOR_ETHEREUM
  }

  const adjustedSignature = `0x${r}${s}${v
    .toString(16)
    .padStart(2, '0')}` as Hex

  return adjustedSignature
}

/**
 * Converts BigInt values to strings recursively within an object or array.
 * @internal
 */
function convertBigIntsToStrings<T>(value: T): T {
  if (typeof value === 'bigint') {
    return value.toString() as T
  }
  if (Array.isArray(value)) {
    return value.map(convertBigIntsToStrings) as T
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, convertBigIntsToStrings(v)]),
    ) as T
  }
  return value
}

export const getTxHashResult = (result: unknown) => {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if ('fill' in r && r.fill && typeof r.fill === 'object') {
      const fill = r.fill as Record<string, unknown>
      if ('hash' in fill) {
        return fill.hash
      }
    }
    // legacy structure
    if ('fillTransactionHash' in r) {
      return r.fillTransactionHash
    }
    if ('transactionHash' in r) {
      return r.transactionHash
    }
  }
  return null
}

export type RhinestoneTransactionResult = {
  hash: Hex
}
