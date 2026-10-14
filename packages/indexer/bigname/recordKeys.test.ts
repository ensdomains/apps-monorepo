import { describe, expect, it } from 'vitest'
import { parseRecordKey } from './recordKeys'

describe('parseRecordKey', () => {
  it('parses each product key and rejects anything else', () => {
    expect(parseRecordKey('text:com.github')).toEqual({
      kind: 'text',
      key: 'com.github',
    })
    expect(parseRecordKey('addr:2147483658')).toEqual({
      kind: 'addr',
      coinType: 2147483658,
    })
    expect(parseRecordKey('avatar')).toEqual({ kind: 'avatar' })
    expect(parseRecordKey('contenthash')).toEqual({ kind: 'contenthash' })
    expect(parseRecordKey('addr:')).toBeUndefined()
    expect(parseRecordKey('addr:01')).toBeUndefined()
    expect(parseRecordKey('addr:0x3c')).toBeUndefined()
    expect(parseRecordKey('text:')).toBeUndefined()
    expect(parseRecordKey('name')).toBeUndefined()
  })
})
