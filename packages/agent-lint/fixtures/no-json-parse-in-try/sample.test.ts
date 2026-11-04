export const decode = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw cause
  }
}
