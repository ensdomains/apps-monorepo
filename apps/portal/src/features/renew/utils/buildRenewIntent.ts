import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { encodeRenewBatchData } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { renewNameWriteParameters } from '@ensdomains/ensjs/wallet'
import { type Address, encodeFunctionData, type PublicClient } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { ENS_LABS_REFERRER } from '@/lib/referrer'
import { ensChain } from '@/lib/wagmi'
import { getLabel } from '@/utils/token/getLabel'
import { isCanonicalName } from '@/utils/token/isNormalized'
import type { MultiRenewalEntry } from '../hooks/useRenewalTransactions'

type RenewBatchParams = {
  readonly referrer?: string
  readonly renewals: readonly MultiRenewalEntry[]
  /** The renewer every entry belongs to — the batch's call target. */
  readonly renewer: Address
  readonly tokenAddress: Address
  readonly from: Address
}

export type RenewParams = {
  readonly name: string
  readonly duration: number
  readonly referrer?: string
  readonly tokenAddress: Address
  readonly from: Address
  readonly publicClient: PublicClient
  /** Selects the renewer address — v2 ETHRegistrar vs v1 ETHRenewerV1. */
  readonly isV2: boolean
}

// The same gate `isExtendable2LD` applies to the UI, repeated at the point of
// signing so no path into the flow can substitute the canonical twin: the label
// sent comes from `getLabel`, which normalises, so renewing `ALICE.eth` would
// push `alice.eth`'s expiry instead. Throwing stops both the modal's gas
// estimate and the submit.
function assertCanonicalName(name: string) {
  if (!isCanonicalName(name))
    throw new Error(
      `Refusing to renew "${name}": the name isn't written in its normalized form, so renewing it would extend a different name.`,
    )
}

// Shared builder: the renew intent used by BOTH the pre-start gas estimate and
// the submit path. `renewNameWriteParameters` is a pure encode (no network I/O);
// the client only supplies chain contract addresses. Exported so its refusals
// can be tested directly — every renew in the app is built in this file.
export function buildRenewIntent(params: RenewParams): CustomTransactionIntent {
  assertCanonicalName(params.name)
  // ensjs splits the label without normalizing, so pass a normalized 2LD name.
  const writeParams = renewNameWriteParameters(
    params.publicClient as unknown as Parameters<
      typeof renewNameWriteParameters
    >[0],
    {
      name: `${getLabel(params.name)}.eth`,
      duration: BigInt(params.duration),
      paymentToken: params.tokenAddress,
      referrer: normalizeReferrer(params.referrer, ENS_LABS_REFERRER),
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
    chainId: ensChain.id,
  })
}

/**
 * One `renewBatch` call renewing every entry on a single renewer, each at its own
 * duration. The renewer pulls the summed rent once, and the batch is atomic.
 */
export function buildRenewBatchIntent(
  params: RenewBatchParams,
): CustomTransactionIntent {
  const entries = params.renewals.map(({ selectedName, duration }) => {
    assertCanonicalName(selectedName.name)
    return {
      label: getLabel(selectedName.name),
      duration: BigInt(duration),
      referrer: normalizeReferrer(params.referrer, ENS_LABS_REFERRER),
    }
  })

  return toEoaCustomIntent({
    from: params.from,
    to: params.renewer,
    data: encodeRenewBatchData(entries, params.tokenAddress),
    chainId: ensChain.id,
  })
}
