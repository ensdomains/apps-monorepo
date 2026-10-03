import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type GetDnsImportDataReturnType,
  importDnsName,
} from '@ensdomains/ensjs/dns'
import type { Address } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'

export interface PrepareSyncManagerParams {
  /** A chain carrying the ENS contracts — it supplies the DNS registrar. */
  readonly chain: Parameters<typeof importDnsName.makeFunctionData>[0]
  readonly name: string
  /** A fresh DNSSEC proof of the name's `_ens` TXT record. */
  readonly dnsImportData: GetDnsImportDataReturnType
  readonly from: Address
}

/**
 * The Sync Manager intent, shared by the gas estimate and the transaction.
 * Passing no `address` makes `importDnsName` encode a plain `proveAndClaim`,
 * which points the name's manager at the address in the proven `_ens` record
 * — the connected wallet, per the banner's gating.
 */
export const prepareSyncManagerTransaction = ({
  chain,
  name,
  dnsImportData,
  from,
}: PrepareSyncManagerParams): CustomTransactionIntent => {
  const call = importDnsName.makeFunctionData(chain, { name, dnsImportData })
  return toEoaCustomIntent({
    from,
    to: call.to,
    data: call.data,
    chainId: chain.id,
  })
}
