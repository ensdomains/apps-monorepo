export const decode = (raw: string): unknown => {
  try {
    return JSON.parse(raw) // expect: no-json-parse-in-try
  } catch {
    return undefined
  }
}
