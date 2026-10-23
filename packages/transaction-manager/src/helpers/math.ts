/** Integer division that rounds up, for token units that cannot carry a remainder. */
export const divCeil = (a: bigint, b: bigint): bigint => (a + b - 1n) / b
