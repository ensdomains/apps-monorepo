export const parentName = (name?: string | null) => {
  if (!name) return ''
  const parts = name.split('.').slice(1)
  return parts.length ? parts.join('.') : '[root]'
}
