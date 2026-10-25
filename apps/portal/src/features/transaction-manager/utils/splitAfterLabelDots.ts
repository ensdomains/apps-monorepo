// Splits after every dot that is directly followed by more text, so
// `sub.young-badger.eth` becomes `sub.` `young-badger.` `eth`. A dot between
// two digits is a decimal (`1.5 USDC`), so it stays whole.
export const splitAfterLabelDots = (text: string): readonly string[] =>
  text.split(/(?<=\.)(?=\S)(?!(?<=\d\.)\d)/)
