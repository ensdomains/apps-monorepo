import { HCA_RENEWAL_INTENT_MAX_ITEMS } from '../service/hcaRenewal'

/** Split the selection into the batches an intent can carry. */
export const chunkRenewalItems = <T>(items: readonly T[]): T[][] => {
  const chunks: T[][] = []
  for (
    let index = 0;
    index < items.length;
    index += HCA_RENEWAL_INTENT_MAX_ITEMS
  ) {
    chunks.push(items.slice(index, index + HCA_RENEWAL_INTENT_MAX_ITEMS))
  }
  return chunks
}
