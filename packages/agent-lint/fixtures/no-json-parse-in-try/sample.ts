export const eventsIn = (body: string): readonly unknown[] => {
  if (!body.startsWith('[')) return []
  try {
    const parsed: unknown = JSON.parse(body) // expect: no-json-parse-in-try
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

// Passes: a parse outside try, and one in the catch block.
export const parseText = (text: string): unknown => JSON.parse(text)
export const parseOr = (text: string): unknown => {
  try {
    return text.trim()
  } catch (cause) {
    return JSON.parse(String(cause))
  }
}

// Passes: the catch rethrows with context, and a try with no catch.
export const decodeOrFail = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw new TypeError('the body is not JSON', { cause })
  }
}
export const decodeWithCleanup = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } finally {
    raw.trim()
  }
}
