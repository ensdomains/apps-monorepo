import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { renewNameWriteParameters } from '@ensdomains/ensjs/wallet'
import {
  type Address,
  encodeFunctionData,
  type PublicClient,
  zeroHash,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getLabel } from '@/utils/token/getLabel'
import { isCanonicalName } from '@/utils/token/isNormalized'

export type RenewParams = {
  readonly name: string
  readonly duration: number
  readonly tokenAddress: Address
  readonly from: Address
  readonly publicClient: PublicClient
  /** Selects the renewer address — v2 ETHRegistrar vs v1 ETHRenewerV1. */
  readonly isV2: boolean
}

// Shared builder: the renew intent used by BOTH the pre-start gas estimate and
// the submit path. `renewNameWriteParameters` is a pure encode (no network I/O);
// the client only supplies chain contract addresses. Exported so its refusals
// can be tested directly — every renew in the app is built here.
export function buildRenewIntent(params: RenewParams): CustomTransactionIntent {
  // The same gate `isExtendable2LD` applies to the UI, repeated at the point of
  // signing so no path into the flow can substitute the canonical twin: the
  // label below comes from `getLabel`, which normalises, so renewing
  // `ALICE.eth` would push `alice.eth`'s expiry instead. Throwing here stops
  // both the modal's gas estimate and the submit.
  if (!isCanonicalName(params.name))
    throw new Error(
      `Refusing to renew "${params.name}": the name isn't written in its normalized form, so renewing it would extend a different name.`,
    )
  // ensjs splits the label without normalizing, so pass a normalized 2LD name.
  const writeParams = renewNameWriteParameters(
    params.publicClient as unknown as Parameters<
      typeof renewNameWriteParameters
    >[0],
    {
      name: `${getLabel(params.name)}.eth`,
      duration: BigInt(params.duration),
      paymentToken: params.tokenAddress,
      referrer: zeroHash,
      contract: params.isV2 ? 'ensEthRegistrar' : 'ensEthRenewerV1',
    },
  )

  const renewData = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  return toEoaCustomIntent({
    from: params.from,
    to: writeParams.address,
    data: renewData,
    chainId: sepoliaWithEns.id,
  })
}
