import { type Address, getAddress, isAddress } from 'viem'

const REVERSE_ADDRESS_LABEL = /^[0-9a-f]{40}$/i
const COIN_TYPE_LABEL = /^[0-9a-f]{8}$/i

/** Extract the wallet represented by an EVM reverse record name. */
export const getReverseNameAddress = (name: string): Address | null => {
  const labels = name.split('.')
  if (labels.length !== 3 || labels[2]?.toLowerCase() !== 'reverse') {
    return null
  }

  const [addressLabel, namespace] = labels
  if (!addressLabel || !REVERSE_ADDRESS_LABEL.test(addressLabel)) return null
  if (
    !namespace ||
    (namespace.toLowerCase() !== 'addr' &&
      namespace.toLowerCase() !== 'default' &&
      !COIN_TYPE_LABEL.test(namespace))
  ) {
    return null
  }

  const address = `0x${addressLabel}`
  return isAddress(address, { strict: false }) ? getAddress(address) : null
}
