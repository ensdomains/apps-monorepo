/** bigname's spelling of a label it cannot state: `[<64 lowercase hex>]`. */
const UNKNOWN_LABEL = /^\[[0-9a-f]{64}\]$/

export const isUnknownLabel = (label: string): boolean =>
  UNKNOWN_LABEL.test(label)
