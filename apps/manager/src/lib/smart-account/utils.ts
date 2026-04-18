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
import { maxUint256 } from 'viem'

/** Para’s viem integration may attach wallet IDs on the account; not part of viem’s public `Account` type */
type ParaAccountExtensions = {
  walletId?: string
  _walletId?: string
  _paraWalletId?: string
}

/** Matches `WalletClient.signTransaction`; viem’s `Account['signTransaction']` uses a wider union that doesn’t narrow cleanly when merged with `account`. */
type WalletSignTransactionParameters = Parameters<
  WalletClient['signTransaction']
>[0]

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
      const serializedTypedData: TypedDataDefinition<typedData, primaryType> = {
        ...def,
        message: convertBigIntsToStrings(def.message) as Record<
          string,
          unknown
        >,
      }
      return walletClient.signTypedData({
        account: address,
        ...serializedTypedData,
      } as Parameters<WalletClient['signTypedData']>[0])
    },
    async signTransaction(
      transaction: WalletSignTransactionParameters,
    ): Promise<Hex> {
      return walletClient.signTransaction({
        ...transaction,
        account: address,
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
  const paraAccount = viemAccount as Account & ParaAccountExtensions
  const effectiveWalletId =
    walletId ?? paraAccount.walletId ?? paraAccount._walletId

  if (effectiveWalletId) {
    paraAccount._paraWalletId = effectiveWalletId
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

const TWO_POW_256 = 2n ** 256n

export function normalizeSessionDetailsForEip712Signing(sessionDetails: {
  readonly nonces: readonly bigint[]
  readonly hashesAndChainIds: readonly { chainId: bigint; sessionDigest: Hex }[]
  readonly data: { message?: unknown }
}): void {
  const msg = sessionDetails.data.message
  if (msg === null || msg === undefined || typeof msg !== 'object') {
    return
  }

  const message = msg as {
    sessionsAndChainIds?: Array<{
      chainId?: unknown
      session?: {
        expires?: unknown
        nonce?: unknown
        [key: string]: unknown
      }
    }>
  }

  const rows = message.sessionsAndChainIds
  if (!rows?.length) return

  rows.forEach((row, i) => {
    const digestRow = sessionDetails.hashesAndChainIds[i]
    const nonceFromRpc = sessionDetails.nonces[i]

    row.chainId = toChainSessionUint64(row.chainId, digestRow?.chainId)

    const session = row.session
    if (!session) return

    session.expires = toSignedSessionExpires(session.expires)
    session.nonce = toSignedSessionNonce(session.nonce, nonceFromRpc)
  })
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

function toChainSessionUint64(
  value: unknown,
  fallback: bigint | undefined,
): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (fallback !== undefined) return fallback
  return 0n
}

function toSignedSessionExpires(value: unknown): bigint {
  if (typeof value === 'bigint') {
    if (value === TWO_POW_256) return maxUint256
    return value
  }
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      return maxUint256
    }
    return BigInt(value)
  }
  return maxUint256
}

function toSignedSessionNonce(
  value: unknown,
  fallback: bigint | undefined,
): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (fallback !== undefined) return fallback
  return 0n
}

export const getTxHashResult = (result: unknown): Hex | null => {
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if ('fill' in obj && obj.fill && typeof obj.fill === 'object') {
      const fill = obj.fill as Record<string, unknown>
      if ('hash' in fill) {
        return fill.hash as Hex
      }
    }
    // legacy structure
    if ('fillTransactionHash' in obj) {
      return obj.fillTransactionHash as Hex
    }
    if ('transactionHash' in obj) {
      return obj.transactionHash as Hex
    }
  }
  return null
}

export type RhinestoneTransactionResult = {
  hash: Hex
}
