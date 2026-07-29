/**
 * Clear one L1 reverse registrar (`default.reverse` or `addr.reverse`) via
 * `setName('')`. Discovery of which registrar(s) hold the name lives here too —
 * prepare/UI share it so each clear is its own modal step.
 *
 * `setName('')` keys on msg.sender, so the connected wallet must be `owner`.
 */

import {
  ENS_SEPOLIA_CONTRACTS,
  type Signer,
} from '@ens-apps/transaction-manager'
import { getName, getReverseRecordFromRegistry } from '@ensdomains/ensjs/public'
import { defaultReverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/defaultReverseRegistrar'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { isAddressEqual } from 'viem'
import { normalize } from 'viem/ens'
import { DEFAULT_REVERSE_REGISTRAR_ADDRESS } from '@/features/reverse-resolution/config'
import { setReverseResolution } from '@/features/reverse-resolution/helpers/setReverseResolution'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { safeGetClient } from '@/lib/wagmi/helpers'

export type UnsetPrimaryTargets = {
  readonly clearDefault: boolean
  readonly clearReverse: boolean
}

export const unsetPrimaryTargetsQueryKey = (owner: Address, name: string) =>
  ['unset-primary-targets', owner, name] as const

export const getUnsetPrimaryTargets = async ({
  owner,
  name,
}: {
  readonly owner: Address
  readonly name: string
}): Promise<UnsetPrimaryTargets> => {
  const clientResult = safeGetClient()
  if (clientResult.isErr()) {
    throw new Error('Failed to get client')
  }

  const client = clientResult.value
  const [defaultRecord, reverseRecord] = await Promise.all([
    getName(client, {
      address: owner,
      coinType: DEFAULT_EVM_COIN_TYPE,
      allowMismatch: true,
    }),
    getName(client, {
      address: owner,
      coinType: MAINNET_COIN_TYPE,
      allowMismatch: true,
    }),
  ])

  let reverseName = reverseRecord?.name ?? null
  if (!reverseName) {
    const fallback = await getReverseRecordFromRegistry(client, {
      address: owner,
    })
    reverseName = fallback?.name ?? null
  }

  const normalizedName = normalize(name)
  const matches = (value: string | null | undefined) =>
    !!value && normalize(value) === normalizedName

  return {
    clearDefault: matches(defaultRecord?.name),
    clearReverse: matches(reverseName),
  }
}

type UnsetPrimaryTarget = 'default' | 'addr'

type UnsetPrimaryNameParameters = {
  readonly name: string
  readonly owner: Address
  readonly target: UnsetPrimaryTarget
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export const unsetPrimaryName = async ({
  name,
  owner,
  target,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: UnsetPrimaryNameParameters): Promise<{ txId: string; hash: Hex }> => {
  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, owner)
  ) {
    throw new Error(
      'Connected wallet must match the owner whose primary name is being cleared',
    )
  }

  const request =
    target === 'default'
      ? {
          address: DEFAULT_REVERSE_REGISTRAR_ADDRESS,
          abi: defaultReverseRegistrarSetNameSnippet,
          functionName: 'setName' as const,
          args: [''] as const,
        }
      : {
          address: ENS_SEPOLIA_CONTRACTS.ReverseRegistrar,
          abi: reverseRegistrarSetNameSnippet,
          functionName: 'setName' as const,
          args: [''] as const,
        }

  return setReverseResolution({
    name,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
    request,
  })
}
