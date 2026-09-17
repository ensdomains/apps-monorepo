// Approved Design Atlas preset, ede0352d: 6.75s, cubic in/out, no card spin/scale.
export const NFT_REVEAL_DURATION = 6750
export const getNftRevealProgress = (elapsed: number) => {
  const time = Math.max(0, Math.min(1, elapsed / NFT_REVEAL_DURATION))
  return time < 0.5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2
}
