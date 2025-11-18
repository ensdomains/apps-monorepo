export const getTxHashResult = (result: any) => {
  if (result && typeof result === 'object') {
    if ('fill' in result && result.fill && typeof result.fill === 'object') {
      if ('hash' in result.fill) {
        return result.fill.hash
      }
    }
    // legacy structure
    if ('fillTransactionHash' in result) {
      return result.fillTransactionHash
    } else if ('transactionHash' in result) {
      return result.transactionHash
    }
  }
  return null
}

export type RhinestoneTransactionResult = {
  hash: `0x${string}`
}
