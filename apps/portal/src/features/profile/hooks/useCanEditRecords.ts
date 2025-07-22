import { ResultFn } from "@ens-apps/utils/neverthrow";
import { publicResolverSetAddrSnippet } from '@ensdomains/ensjs/contracts'
import { EMPTY_ADDRESS } from "@ensdomains/ensjs/utils";
import { fromPromise, fromThrowable, ok } from "neverthrow";
import type { Address } from "viem/accounts";
import { type EstimateGasErrorType, estimateGas } from "viem/actions";
import { type NamehashErrorType, namehash } from "viem/ens";
import { type EncodeFunctionDataErrorType, encodeFunctionData } from "viem/utils";
import { safeGetClient } from "@/lib/wagmi/helpers";


export const canEditRecords = ResultFn(async function* ({ name, resolverAddress }: { name: string; resolverAddress: Address }) {
  const client = yield* safeGetClient()

  const safeNamehash = fromThrowable(() => namehash(name), e => e as NamehashErrorType)

  const node = yield* safeNamehash()

  const safeEncodeFunctionData = fromThrowable(() => encodeFunctionData({
    abi: publicResolverSetAddrSnippet,
    args: [node, 60n, EMPTY_ADDRESS],
  }), e => e as EncodeFunctionDataErrorType)

  const data = yield* safeEncodeFunctionData()

  const gasResult = await fromPromise(estimateGas(client, {
    to: resolverAddress,
    account: client.account,
    data,
  }), e => e as EstimateGasErrorType)


  return ok(!(gasResult.isErr() || gasResult.value === 0n))
})

export const useCanEditRecords = ({ name }: { name: string }) => {

}