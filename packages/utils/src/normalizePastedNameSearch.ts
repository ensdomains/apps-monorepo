import { tokenise } from '@ensdomains/ensjs/utils'
import type { ClipboardEvent } from 'react'

/** Whitespace and copy/paste artifacts that should not appear in an ENS search. */
const PASTED_NAME_NOISE = /[\s\u200B\u200C\uFEFF\u00AD]/g

const ZERO_WIDTH_JOINER = 0x200d

/**
 * A zero-width joiner is noise unless ENS reads it as part of an emoji sequence, like 👨‍💻.
 * The ENS tokenizer reports each joiner, in order, as inside an emoji token or as disallowed.
 */
const stripStrayZeroWidthJoiners = (text: string): string => {
  const keep = tokenise(text).flatMap((token) => {
    if (token.type === 'emoji')
      return token.input
        .filter((cp) => cp === ZERO_WIDTH_JOINER)
        .map(() => true)
    if (token.type === 'disallowed' && token.cp === ZERO_WIDTH_JOINER)
      return [false]
    return []
  })
  let index = 0
  return text.replaceAll('\u200D', () => (keep[index++] ? '\u200D' : ''))
}

/** Lowercase pasted text and strip spaces so "Hello World" becomes "helloworld". */
export const normalizePastedNameSearch = (text: string): string =>
  stripStrayZeroWidthJoiners(
    text.toLowerCase().replaceAll(PASTED_NAME_NOISE, ''),
  )

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
