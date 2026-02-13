import * as v from 'valibot'

const urlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.url('Enter a valid URL (e.g. https://example.com)'),
)

export const validateUrl = (value: string | undefined): string | undefined => {
  if (!value || value.trim() === '') return undefined

  const result = v.safeParse(urlSchema, value)

  if (!result.success) {
    return result.issues[0]?.message ?? 'Invalid URL'
  }

  return undefined
}
