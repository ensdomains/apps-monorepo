/**
 * Whether `name` is a `.eth` second-level name (`alice.eth`), the only names
 * the `.eth` registrar leases. Every other name with an expiry, such as a
 * subname, has no registrar grace and is renewed by its parent's owner.
 */
export const isEthSecondLevelName = (name: string): boolean => {
  const labels = name.split('.')
  return labels.length === 2 && labels[0] !== '' && labels[1] === 'eth'
}

/** The name one label up (`alice.eth` for `pay.alice.eth`), if any. */
export const getParentName = (name: string): string | undefined => {
  const dot = name.indexOf('.')
  return dot === -1 || dot === name.length - 1 ? undefined : name.slice(dot + 1)
}
