export const formatNamesPreview = (
  names: readonly string[],
  limit = 3,
): string => {
  const preview = names.slice(0, limit).join(', ')
  const suffix = names.length > limit ? ` (+${names.length - limit} more)` : ''
  return `${preview}${suffix}`
}
