import { getCoderByCoinType } from '@ensdomains/address-encoder'
import { getCoderFromCoin } from '@ensdomains/ensjs/utils'
import { fromThrowable } from 'neverthrow'
import { getAddressPresentation } from '@/features/profile/data/records'

export const getAddressRecordLabel = (coinType: number): string =>
  getAddressPresentation(coinType).label

// ensjs encodes the write with its own copy, which still codes coins 3.0.0 removed.
const getAppCoder = fromThrowable((coinType: number) =>
  getCoderByCoinType(coinType),
)
const getEnsjsCoder = fromThrowable((coinType: number) =>
  getCoderFromCoin(coinType),
)
const getCoder = (coinType: number) =>
  getAppCoder(coinType).orElse(() => getEnsjsCoder(coinType))

export const validateAddressRecordValue = (
  coinType: number,
  value: string | undefined,
): string | undefined => {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return undefined

  return getCoder(coinType).match(
    (coder) =>
      fromThrowable(() => coder.decode(trimmed))().isOk()
        ? undefined
        : `Enter a valid ${getAddressRecordLabel(coinType)} address`,
    () => 'Unsupported address type',
  )
}
