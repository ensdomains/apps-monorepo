import { describe, expect, it } from 'vitest'
import { getPageTitle } from './pageTitle'

const ADDRESS = '0xE3CC38fb4da8a96A6Ab245022E6778a1eD32619c'

describe('getPageTitle', () => {
  it('truncates an address the way the address page does', () => {
    expect(getPageTitle(`/addr/${ADDRESS}`)).toBe(
      '0xE3CC…2619c — ENS Explorer App',
    )
  })

  it('joins address subpages with a slash', () => {
    expect(getPageTitle(`/addr/${ADDRESS}/names`)).toBe(
      '0xE3CC…2619c > names — ENS Explorer App',
    )
  })

  it('labels resolver and registry contract pages', () => {
    expect(getPageTitle(`/resolver/${ADDRESS}`)).toBe(
      'Resolver 0xE3CC…2619c — ENS Explorer App',
    )
    expect(getPageTitle(`/registry/${ADDRESS}`)).toBe(
      'Registry 0xE3CC…2619c — ENS Explorer App',
    )
  })

  it('names the page after the ENS name', () => {
    expect(getPageTitle('/foxes.eth')).toBe('foxes.eth — ENS Explorer App')
  })

  it('joins name subpages with an arrow', () => {
    expect(getPageTitle('/foxes.eth/records')).toBe(
      'foxes.eth > records — ENS Explorer App',
    )
  })

  it('reads the register target from the query string', () => {
    expect(getPageTitle('/register', 'foxes.eth')).toBe(
      'foxes.eth — ENS Explorer App',
    )
  })

  it('titles a TLD page', () => {
    expect(getPageTitle('/tld/eth')).toBe('eth — ENS Explorer App')
  })

  it('falls back to the bare app name', () => {
    expect(getPageTitle('/')).toBe('ENS Explorer App')
  })

  it('decodes percent-encoded names', () => {
    expect(getPageTitle('/caf%C3%A9.eth')).toBe('café.eth — ENS Explorer App')
  })
})
