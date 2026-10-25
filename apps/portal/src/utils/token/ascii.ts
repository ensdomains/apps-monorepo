// biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range starts at U+0000
const NON_ASCII = /[^\x00-\x7f]/

export const isAscii = (name: string) => !NON_ASCII.test(name)

export const asciiEncode = (name: string) => {
  try {
    return new URL(`https://${name}`).hostname
  } catch {
    return name
  }
}
