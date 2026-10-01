import type { ClipboardEvent } from 'react'

/** Whitespace and copy/paste artifacts that should not appear in an ENS search. */
const PASTED_NAME_NOISE = /[\s\u200B\u200C\uFEFF\u00AD]/g

/** A zero-width joiner is noise unless it joins two emoji, where ENS keeps it as part of the name. */
const STRAY_ZERO_WIDTH_JOINER =
  /(?<!\p{Extended_Pictographic}|\uFE0F|[\u{1F3FB}-\u{1F3FF}])\u200D|\u200D(?!\p{Extended_Pictographic})/gu

/** Lowercase pasted text and strip spaces so "Hello World" becomes "helloworld". */
export const normalizePastedNameSearch = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(PASTED_NAME_NOISE, '')
    .replaceAll(STRAY_ZERO_WIDTH_JOINER, '')

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
