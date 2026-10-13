import { describe, expect, it } from 'vitest'
import {
  getUrlInputBlurValue,
  getUrlInputChangeValue,
  getUrlInputFocusValue,
} from './urlInputPrefix'

describe('getUrlInputFocusValue', () => {
  it('prefills https:// when empty', () => {
    expect(getUrlInputFocusValue('')).toBe('https://')
    expect(getUrlInputFocusValue('  ')).toBe('https://')
  })

  it('keeps existing values', () => {
    expect(getUrlInputFocusValue('https://ens.domains')).toBe(
      'https://ens.domains',
    )
  })
})

describe('getUrlInputChangeValue', () => {
  it('keeps typed values after the prefix', () => {
    expect(getUrlInputChangeValue('https://ens.domains')).toBe(
      'https://ens.domains',
    )
  })

  it('drops the prefix when a full URL is pasted after it', () => {
    expect(getUrlInputChangeValue('https://https://ens.domains')).toBe(
      'https://ens.domains',
    )
    expect(getUrlInputChangeValue('https://http://ens.domains')).toBe(
      'http://ens.domains',
    )
  })

  it('leaves values without the prefix alone', () => {
    expect(getUrlInputChangeValue('ens.domains')).toBe('ens.domains')
  })
})

describe('getUrlInputBlurValue', () => {
  it('clears an untouched prefix', () => {
    expect(getUrlInputBlurValue('https://')).toBe('')
    expect(getUrlInputBlurValue(' https:// ')).toBe('')
  })

  it('adds https:// to bare domains', () => {
    expect(getUrlInputBlurValue('jefflau.net')).toBe('https://jefflau.net')
    expect(getUrlInputBlurValue(' www.ens.domains/blog ')).toBe(
      'https://www.ens.domains/blog',
    )
  })

  it('leaves other schemes and non-domains alone', () => {
    expect(getUrlInputBlurValue('http://ens.domains')).toBe(
      'http://ens.domains',
    )
    expect(getUrlInputBlurValue('ipfs://bafybeigdyrzt')).toBe(
      'ipfs://bafybeigdyrzt',
    )
    expect(getUrlInputBlurValue('hello')).toBe('hello')
  })

  it('trims other values', () => {
    expect(getUrlInputBlurValue(' https://ens.domains ')).toBe(
      'https://ens.domains',
    )
  })
})
