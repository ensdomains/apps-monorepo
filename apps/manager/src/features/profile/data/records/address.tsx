import { getAddressRecordIcon } from '@ens-apps/record-catalog/address-icons'
import { getAddressMetadata } from './addressMetadata'

export const getAddressPresentation = (coinType: number) => ({
  ...getAddressMetadata(coinType),
  icon: getAddressRecordIcon(coinType),
})
