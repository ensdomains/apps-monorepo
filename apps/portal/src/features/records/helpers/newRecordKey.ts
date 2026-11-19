import type { AddressRecordOption } from '@ens-apps/record-catalog'
import { match } from 'ts-pattern'
import type { RecordType } from '@/utils/records/editRecordUtils'

export type NewRecordKey =
  | { readonly type: 'address'; readonly coin: AddressRecordOption }
  | { readonly type: 'text'; readonly key: string }
  | { readonly type: 'abi' | 'contentHash' }

/** What the add form would stage, or undefined while its type or key is missing. */
export const getNewRecordKey = (
  type: RecordType | '',
  key: string,
  coin: AddressRecordOption | undefined,
): NewRecordKey | undefined =>
  match(type)
    .with('', () => undefined)
    .with('address', (type) => (coin ? { type, coin } : undefined))
    .with('text', (type) => (key ? { type, key } : undefined))
    .with('abi', 'contentHash', (type) => ({ type }))
    .exhaustive()
