import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Hex, WalletClient } from 'viem'
import {
  encodeFunctionData,
  encodePacked,
  keccak256,
  type PublicClient,
  toFunctionSelector,
} from 'viem'
import { DEFAULT_REVERSE_REGISTRAR_ABI } from '../../contracts/abis/DefaultReverseRegistrar.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'
import type { TransactionRequest } from '../../types/transaction.types'

/**
 * Request EOA signature for setNameForAddrWithSignature
 *
 * The signature authorizes setting the primary name for the EOA address.
 * This allows the smart account to submit the transaction on behalf of the EOA.
 */
/**
 * Result type for signature request - includes both signature and expiry
 * to ensure they stay coupled (the expiry is embedded in the signed message)
 */
export interface SignatureResult {
  signature: Hex
  signatureExpiry: bigint
}

export function requestEOASignatureActor(input: {
  name: string
  eoaAddress: Address
  signatureExpiry: bigint
  coinTypes: bigint[]
  walletClient: WalletClient
  registrarAddress: Address
}): ResultAsync<SignatureResult, Error> {
  return fromPromise(
    (async () => {
      const {
        name,
        eoaAddress,
        signatureExpiry,
        coinTypes,
        walletClient,
        registrarAddress,
      } = input

      // Ensure name has .eth suffix
      const cleanName = name.endsWith('.eth') ? name : `${name}.eth`

      // Get function selector for setNameForAddrWithSignature
      // function setNameForAddrWithSignature(address addr, uint256 signatureExpiry, string name, uint256[] coinTypes, bytes signature)
      const selector = toFunctionSelector(
        'setNameForAddrWithSignature(address,uint256,string,uint256[],bytes)',
      )

      // Build the message hash as the contract does
      // keccak256(abi.encodePacked(address(this), selector, addr, signatureExpiry, name, coinTypes))
      const packedData = encodePacked(
        ['address', 'bytes4', 'address', 'uint256', 'string', 'uint256[]'],
        [
          registrarAddress,
          selector,
          eoaAddress,
          signatureExpiry,
          cleanName,
          coinTypes,
        ],
      )
      const messageHash = keccak256(packedData)

      console.log('🔐 [PRIMARY NAME] Requesting EOA signature:', {
        eoaAddress,
        signatureExpiry: signatureExpiry.toString(),
        name: cleanName,
        coinTypes: coinTypes.map((c) => c.toString()),
        messageHash,
      })

      // Request signature from EOA wallet
      // Using signMessage with raw bytes applies EIP-191 prefix automatically
      const signature = await walletClient.signMessage({
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        account: walletClient.account!,
        message: { raw: messageHash },
      })

      console.log('✅ [PRIMARY NAME] EOA signature obtained')

      // Return both signature and expiry to keep them coupled
      // The expiry is embedded in the signed message, so they must match
      return { signature, signatureExpiry }
    })(),
    (error) => {
      console.error('❌ [PRIMARY NAME] Failed to get EOA signature:', error)
      return error as Error
    },
  )
}

/**
 * Submit primary name update with signature via smart account
 *
 * Calls setNameForAddrWithSignature on the reverse registrar.
 * The smart account pays for gas while setting the name for the EOA.
 */
export function submitPrimaryNameWithSignatureActor(input: {
  name: string
  eoaAddress: Address
  signature: Hex
  signatureExpiry: bigint
  coinTypes: bigint[]
  signer: import('../..').Signer
  publicClient: PublicClient
  chainId: number
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const {
        name,
        eoaAddress,
        signature,
        signatureExpiry,
        coinTypes,
        signer,
        publicClient,
        chainId,
      } = input

      const registrarAddress = ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar

      // Ensure name has .eth suffix
      const cleanName = name.endsWith('.eth') ? name : `${name}.eth`

      // Encode the function call
      const data = encodeFunctionData({
        abi: DEFAULT_REVERSE_REGISTRAR_ABI,
        functionName: 'setNameForAddrWithSignature',
        args: [eoaAddress, signatureExpiry, cleanName, coinTypes, signature],
      })

      // Smart account is the sender
      const smartAccountAddress = getSmartAccountAddress(signer)

      console.log('📤 [PRIMARY NAME] Submitting setNameForAddrWithSignature:', {
        eoaAddress,
        smartAccountAddress,
        name: cleanName,
        signatureExpiry: signatureExpiry.toString(),
      })

      let request: TransactionRequest

      if (signer.type === 'zerodev') {
        request = {
          type: 'zerodev' as const,
          from: smartAccountAddress,
          to: registrarAddress,
          data,
          value: 0n,
          chainId,
          zerodevParams: {
            calls: [{ to: registrarAddress, data, value: 0n }],
            sponsored: true,
          },
        }
      } else if (signer.type === 'rhinestone') {
        request = {
          type: 'rhinestone-intent' as const,
          from: smartAccountAddress,
          to: registrarAddress,
          data,
          value: 0n,
          chainId,
          rhinestoneParams: {
            calls: [{ to: registrarAddress, data, value: 0n }],
            sponsored: true,
          },
        }
      } else {
        throw new Error(
          `Unsupported signer type for signature flow: ${signer.type}`,
        )
      }

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        signer,
        {
          description: `Set primary name to ${cleanName} for ${eoaAddress}`,
          publicClient,
        },
      )

      return txId
    })(),
    (error) => {
      console.error('❌ [PRIMARY NAME] Failed to submit with signature:', error)
      return error as Error
    },
  )
}

export function submitPrimaryNameUpdateActor(input: {
  name: string
  signer: import('../..').Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const registrarAddress = ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar

      const cleanName = input.name.endsWith('.eth')
        ? input.name
        : `${input.name}.eth`

      const data = encodeFunctionData({
        abi: DEFAULT_REVERSE_REGISTRAR_ABI,
        functionName: 'setName',
        args: [cleanName],
      })

      let fromAddress: Address
      let request: TransactionRequest

      if (input.signer.type === 'eoa') {
        fromAddress = input.accountAddress

        request = {
          type: 'eoa' as const,
          from: fromAddress,
          to: registrarAddress,
          data,
          value: 0n,
          chainId: input.chainId,
        }
      } else {
        const smartAccountAddress = getSmartAccountAddress(input.signer)
        fromAddress = smartAccountAddress

        if (input.signer.type === 'rhinestone') {
          request = {
            type: 'rhinestone-intent' as const,
            from: fromAddress,
            to: registrarAddress,
            data,
            value: 0n,
            chainId: input.chainId,
            rhinestoneParams: {
              calls: [
                {
                  to: registrarAddress,
                  data,
                  value: 0n,
                },
              ],
              sponsored: true,
            },
          }
        } else if (input.signer.type === 'zerodev') {
          request = {
            type: 'zerodev' as const,
            from: fromAddress,
            to: registrarAddress,
            data,
            value: 0n,
            chainId: input.chainId,
            zerodevParams: {
              calls: [
                {
                  to: registrarAddress,
                  data,
                  value: 0n,
                },
              ],
              sponsored: true,
            },
          }
        } else {
          throw new Error(
            `Unsupported signer type for primary name update: ${input.signer.type}`,
          )
        }
      }

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          description: `Set primary name to ${cleanName}`,
          publicClient: input.publicClient,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}
