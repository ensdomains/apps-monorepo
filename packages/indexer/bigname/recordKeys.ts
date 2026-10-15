/** One product record key, parsed. */
export type ParsedRecordKey =
  | Readonly<{ kind: 'contenthash' }>
  | Readonly<{ kind: 'avatar' }>
  | Readonly<{ kind: 'text'; key: string }>
  | Readonly<{ kind: 'addr'; coinType: number }>

const DECIMAL = /^(0|[1-9][0-9]*)$/

/** A bigname record key (`text:<key>`, `addr:<coin>`, `avatar`, `contenthash`); undefined otherwise. */
export const parseRecordKey = (key: string): ParsedRecordKey | undefined => {
  if (key === 'contenthash') return { kind: 'contenthash' }
  if (key === 'avatar') return { kind: 'avatar' }
  if (key.startsWith('text:') && key.length > 'text:'.length)
    return { kind: 'text', key: key.slice('text:'.length) }
  if (!key.startsWith('addr:')) return undefined
  const digits = key.slice('addr:'.length)
  const coinType = Number(digits)
  return DECIMAL.test(digits) && Number.isSafeInteger(coinType)
    ? { kind: 'addr', coinType }
    : undefined
}
