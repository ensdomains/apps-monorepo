/** Whitespace and copy/paste artifacts that should not appear in an ENS search. */
const PASTED_NAME_NOISE = /[\s\u200B-\u200D\uFEFF\u00AD]/g

/** Lowercase pasted text and strip spaces so "Hello World" becomes "helloworld". */
export const normalizePastedNameSearch = (text: string): string =>
  text.toLowerCase().replaceAll(PASTED_NAME_NOISE, '')
