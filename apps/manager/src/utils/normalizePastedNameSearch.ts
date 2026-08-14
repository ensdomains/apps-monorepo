import type { ClipboardEvent } from 'react'

/** Whitespace and copy/paste artifacts that should not appear in an ENS search. */
const PASTED_NAME_NOISE = /[\s\u200B-\u200D\uFEFF\u00AD]/g

/** Lowercase pasted text and strip spaces so "Hello World" becomes "helloworld". */
export const normalizePastedNameSearch = (text: string): string =>
  text.toLowerCase().replaceAll(PASTED_NAME_NOISE, '')

export const insertNormalizedNameSearchPaste = (
  currentValue: string,
  pastedText: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { readonly value: string; readonly caret: number } => {
  const pasted = normalizePastedNameSearch(pastedText)
  const start = selectionStart ?? currentValue.length
  const end = selectionEnd ?? currentValue.length
  return {
    value: `${currentValue.slice(0, start)}${pasted}${currentValue.slice(end)}`,
    caret: start + pasted.length,
  }
}

export const applyPastedNameSearch = (
  event: ClipboardEvent<HTMLInputElement>,
  setValue: (value: string) => void,
  transformValue: (value: string) => string = (value) => value,
) => {
  event.preventDefault()
  const input = event.currentTarget
  const { value, caret } = insertNormalizedNameSearchPaste(
    input.value,
    event.clipboardData.getData('text/plain'),
    input.selectionStart,
    input.selectionEnd,
  )
  const nextValue = transformValue(value)
  setValue(nextValue)
  const nextCaret = Math.min(caret, nextValue.length)
  requestAnimationFrame(() => {
    input.setSelectionRange(nextCaret, nextCaret)
  })
}
