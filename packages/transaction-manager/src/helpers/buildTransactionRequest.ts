import type { Address, Hex } from 'viem'
import type { Signer } from '../types/signer.types'
import type { TransactionRequest } from '../types/transaction.types'
import { getSmartAccountAddress } from './getSmartAccountAddress'

type RhinestoneCall = {
  to: Address
  data: Hex
  value: bigint
}

type BuildRequestParams = {
  signer: Signer
  to: Address
  data: Hex
  value?: bigint
  chainId: number
  accountAddress?: Address
  rhinestoneCalls?: RhinestoneCall[]
}

/**
 * Build a TransactionRequest based on signer type.
 * Reused by multiple actors to avoid duplicating signer routing logic.
 */
export function buildTransactionRequest({
  signer,
  to,
  data,
  value = 0n,
  chainId,
  accountAddress,
  rhinestoneCalls,
}: BuildRequestParams): TransactionRequest {
  if (signer.type === 'rhinestone' || signer.type === 'pimlico') {
    const from = getSmartAccountAddress(signer)
    const calls = rhinestoneCalls ?? [{ to, data, value }]

    return {
      type: 'rhinestone-intent',
      from,
      to,
      data,
      value,
      chainId,
      rhinestoneParams: {
        calls,
      },
    }
  }

  if (signer.type === 'eoa') {
    if (!accountAddress) {
      throw new Error('Account address is required for EOA signer')
    }

    return {
      type: 'eoa',
      from: accountAddress,
      to,
      data,
      value,
      chainId,
    }
  }

  throw new Error(
    'Only Smart Account, or EOA signers are supported for this operation',
  )
}
