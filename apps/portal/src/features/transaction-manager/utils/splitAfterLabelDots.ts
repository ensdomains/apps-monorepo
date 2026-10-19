// Splits after every dot that is directly followed by more text, so
// `sub.young-badger.eth` becomes `sub.` `young-badger.` `eth`.
export const splitAfterLabelDots = (text: string): readonly string[] =>
  text.split(/(?<=\.)(?=\S)/)
